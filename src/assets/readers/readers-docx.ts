/**
 * @file src/assets/readers/readers-docx.ts
 * @description DOCX file reader.
 * @author JUNGHO
 * @since 2026-05-02
 */

// DOCX File Handler
//
// Approach: expose DOCX as filtered/raw XML through existing read_file + edit_block.
//
// READ (default): Returns a text-bearing outline — skips shapes, drawings, SVG noise.
// Shows paragraphs with text, tables with cell content, style info, and image refs.
// Each element shows its raw XML tag context so Claude can target it for editing.
//
// READ (with offset/length): Returns raw pretty-printed XML with line pagination,
// so Claude can drill into specific sections when the outline isn't enough.
//
// EDIT (old_string/new_string): Find/replace on the pretty-printed XML, then
// compact and repack into valid DOCX. Works exactly like text file editing.
//
// Round-trip: DOCX → unzip → pretty-print → [outline or raw] → edit → compact → repack

import fs from "node:fs/promises";
import type { EditResult, FileHandler, FileInfo, FileResult, ReadOptions } from "@assets/readers/readers-base";
import PizZip from "pizzip";

const XML_TAG_BOUNDARY_PATTERN = /(?<=>)(?=<)/;
const XML_BODY_PATTERN = /<w:body[^>]*>([\s\S]*)<\/w:body>/;
const XML_TAG_NAME_PATTERN = /^<(\S+?)[\s>/]/;
const WORD_TEXT_PATTERN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const WORD_PARAGRAPH_STYLE_PATTERN = /<w:pStyle\s+w:val="([^"]+)"/;
const WORD_TABLE_STYLE_PATTERN = /<w:tblStyle\s+w:val="([^"]+)"/;
const WORD_TABLE_TAG_PATTERN = /<w:tbl[\s>]/g;
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+(.+)/;
const WORD_SPLIT_PATTERN = /\s+/;
const WORD_PARAGRAPH_TAG_PATTERN = /<w:p[\s>]/g;
const WORD_IMAGE_TAG_PATTERN = /<w:drawing[\s>]/g;
type DocxEditContent = {
  oldStr?: string;
  old_string?: string;
  search?: string;
  newStr?: string;
  new_string?: string;
  replace?: string;
  expectedReplacements?: number;
  expected_replacements?: number;
};

// 1. Is docx edit content ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isDocxEditContent(value: unknown): value is DocxEditContent {
  return typeof value === "object" && value !== null;
}
const HEADER_FOOTER_XML_PARTS = ["word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"];

// 1. XML transform ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 1. Pretty-print XML: split tags onto separate lines with indentation ――――――――――――――――――――――――――――
// Preserves text node content exactly. compact→pretty→compact is lossless.
// 2. Pretty print XML ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function prettyPrintXml(xml: string): string {
  const parts = xml.split(XML_TAG_BOUNDARY_PATTERN);
  const lines: string[] = [];
  let depth = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const isClosing = trimmed.startsWith("</");
    const isSelfClosing = trimmed.endsWith("/>");
    const isProcessingInstruction = trimmed.startsWith("<?");
    const isInline = !isClosing && !isSelfClosing && trimmed.includes("</");

    if (isClosing) {
      depth = Math.max(0, depth - 1);
    }
    lines.push("  ".repeat(depth) + trimmed);

    if (!isClosing && !isSelfClosing && !isInline && !isProcessingInstruction) {
      depth++;
    }
  }
  return lines.join("\n");
}

// 2. Compact pretty XML lines ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Does NOT touch whitespace inside <w:t> text nodes.
// 3. Compact XML ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactXml(prettyXml: string): string {
  return prettyXml
    .split("\n")
    .map((l) => l.trimStart())
    .join("");
}

// 2. DOCX ZIP helpers ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

interface DocxZipContents {
  documentXml: string;
  xmlParts: Map<string, string>;
  zip: PizZip;
}

// 4. Load docx zip ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function loadDocxZip(buf: Buffer): DocxZipContents {
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Invalid DOCX: missing word/document.xml");
  }
  const xmlParts = new Map<string, string>();
  // Collect all XML parts for potential editing
  const zipFiles = zip.files;
  for (const relativePath of Object.keys(zipFiles)) {
    if (relativePath.endsWith(".xml") || relativePath.endsWith(".rels")) {
      try {
        xmlParts.set(relativePath, zipFiles[relativePath].asText());
      }
      catch {
        /* skip binary entries */
      }
    }
  }
  return {
    zip,
    documentXml: docFile.asText(),
    xmlParts,
  };
}

// 3. Outline extraction ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 3. Extract a text-bearing outline from document.xml ―――――――――――――――――――――――――――――――――――――――――――――
// Walks direct children of <w:body> and for each:
// - w:p (paragraph): extracts text from <w:t> elements, shows style
// - w:tbl (table): extracts cell text for each row
// - mc:AlternateContent / shapes / drawings: shows size, skips content
// - w:sdt: looks inside for text/tables
// Returns a human-readable outline with enough context for editing.

// 5. Extract outline ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractOutline(xml: string): string {
  const lines: string[] = [];

  // Parse body children using regex — faster and more reliable than DOM for outline
  // Find <w:body>...</w:body>
  const bodyMatch = xml.match(XML_BODY_PATTERN);
  if (!bodyMatch) {
    return "No w:body found in document.xml";
  }
  const bodyContent = bodyMatch[1];

  // Split into top-level children of w:body
  // We need to find top-level elements, respecting nesting
  const children = splitTopLevelElements(bodyContent);

  let paragraphCount = 0;
  let tableCount = 0;
  let imageCount = 0;

  for (const [index, child] of children.entries()) {
    const tagMatch = child.match(XML_TAG_NAME_PATTERN);
    if (!tagMatch) {
      continue;
    }
    const tag = tagMatch[1];

    if (tag === "w:p") {
      const text = extractAllText(child);
      const textFragments = extractTextFragments(child);
      const style = extractParagraphStyle(child);
      const hasDrawing = child.includes("<w:drawing") || child.includes("<mc:AlternateContent");

      let line = `[${index}] w:p`;
      if (style) {
        line += ` style="${style}"`;
      }
      if (text && hasDrawing) {
        line += ` (+ drawing/image)`;
        imageCount++;
      }
      else if (hasDrawing) {
        line += ` [drawing/image, ${(child.length / 1024).toFixed(1)}KB]`;
        imageCount++;
        if (!text) {
          lines.push(line);
          paragraphCount++;
          continue;
        }
      }
      if (textFragments.length > 0) {
        const joined = textFragments.join("");
        if (joined.length > 500) {
          line += `\n  ${textFragments.slice(0, 8).join("")}...`;
        }
        else {
          line += `\n  ${joined}`;
        }
      }
      else if (!hasDrawing) {
        line += " (empty)";
      }
      lines.push(line);
      paragraphCount++;
    }
    else if (tag === "w:tbl") {
      const rows = extractTableRows(child);
      let line = `[${index}] w:tbl (${rows.length} rows)`;
      const style = extractTableStyle(child);
      if (style) {
        line += ` style="${style}"`;
      }
      // Show all rows (tables usually contain the real content)
      for (const [rowIndex, row] of rows.entries()) {
        const cells = row.map((c) => {
          if (!c || c.trim() === "") {
            return "";
          }
          return c.length > 60 ? `${c.slice(0, 60)}…` : c;
        });
        line += `\n  row${rowIndex}: [${cells.join(" | ")}]`;
      }
      lines.push(line);
      tableCount++;
    }
    else if (tag === "w:sdt") {
      // Structured document tag — look inside for content
      const sdtFragments = extractTextFragments(child);
      const innerTables = (child.match(WORD_TABLE_TAG_PATTERN) || []).length;
      let line = `[${index}] w:sdt`;
      if (innerTables > 0) {
        line += ` (contains ${innerTables} table${innerTables > 1 ? "s" : ""})`;
        tableCount += innerTables;
      }
      if (sdtFragments.length > 0) {
        const joined = sdtFragments.join("");
        if (joined.length > 150) {
          line += `\n  ${sdtFragments.slice(0, 3).join("")}...`;
        }
        else {
          line += `\n  ${joined}`;
        }
      }
      lines.push(line);
    }
    else if (tag === "w:sectPr") {
      lines.push(`[${index}] w:sectPr (section properties)`);
    }
    else if (tag === "mc:AlternateContent") {
      lines.push(`[${index}] mc:AlternateContent [drawing, ${(child.length / 1024).toFixed(1)}KB — skipped]`);
      imageCount++;
    }
    else {
      lines.push(`[${index}] ${tag} (${(child.length / 1024).toFixed(1)}KB)`);
    }
  }
  // Summary header
  const header = `DOCX Outline: ${children.length} body children, ${paragraphCount} paragraphs, ${tableCount} tables, ${imageCount} images\nEdit with: edit_block(file, old_string="<w:t>old text</w:t>", new_string="<w:t>new text</w:t>")\nRaw XML: use read_file with offset=1 to see pretty-printed XML for advanced edits.\n${"─".repeat(70)}`;

  return `${header}\n${lines.join("\n")}`;
}

// 4. XML text extraction helpers ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 6. Extract all text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractAllText(xml: string): string {
  const texts: string[] = [];

  for (const match of xml.matchAll(WORD_TEXT_PATTERN)) {
    if (match[1]) {
      texts.push(match[1]);
    }
  }
  return texts.join("").trim();
}

// 7. Extract text fragments ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractTextFragments(xml: string): string[] {
  const fragments: string[] = [];

  for (const match of xml.matchAll(WORD_TEXT_PATTERN)) {
    if (match[1]?.trim()) {
      fragments.push(match[0]);
    }
  }
  return fragments;
}

// 8. Extract paragraph style ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractParagraphStyle(xml: string): string | null {
  const match = xml.match(WORD_PARAGRAPH_STYLE_PATTERN);
  return match?.[1] ?? null;
}

// 9. Extract table style ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractTableStyle(xml: string): string | null {
  const match = xml.match(WORD_TABLE_STYLE_PATTERN);
  return match?.[1] ?? null;
}

// 10. Extract table rows ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractTableRows(tableXml: string): string[][] {
  const rows: string[][] = [];
  // Find each <w:tr>...</w:tr> using nesting-aware extraction
  const rowElements = extractNestedElements(tableXml, "w:tr");
  for (const rowXml of rowElements) {
    const cells: string[] = [];
    const cellElements = extractNestedElements(rowXml, "w:tc");
    for (const cellXml of cellElements) {
      cells.push(extractAllText(cellXml));
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

// 9. Extract nested XML elements ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Returns array of full element strings including open/close tags.
// 11. Extract nested elements ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractNestedElements(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let searchFrom = 0;

  while (searchFrom < xml.length) {
    const openPos = xml.indexOf(openTag, searchFrom);
    if (openPos === -1) {
      break;
    }
    // Check it's actually a tag start (followed by space, >, or /)
    const charAfter = xml[openPos + openTag.length];
    if (charAfter !== " " && charAfter !== ">" && charAfter !== "/") {
      searchFrom = openPos + 1;
      continue;
    }
    // Check for self-closing
    const nextClose = xml.indexOf(">", openPos);
    if (nextClose !== -1 && xml[nextClose - 1] === "/") {
      results.push(xml.slice(openPos, nextClose + 1));
      searchFrom = nextClose + 1;
      continue;
    }
    // Find matching close tag respecting nesting
    let depth = 1;
    let pos = nextClose + 1;
    while (depth > 0 && pos < xml.length) {
      const nextOpen = xml.indexOf(openTag, pos);
      const nextCloseTag = xml.indexOf(closeTag, pos);

      if (nextCloseTag === -1) {
        break; // malformed XML
      }
      if (nextOpen !== -1 && nextOpen < nextCloseTag) {
        // Check it's actually an open tag
        const ca = xml[nextOpen + openTag.length];
        if (ca === " " || ca === ">" || ca === "/") {
          depth++;
        }
        pos = nextOpen + openTag.length;
      }
      else {
        depth--;
        if (depth === 0) {
          results.push(xml.slice(openPos, nextCloseTag + closeTag.length));
        }
        pos = nextCloseTag + closeTag.length;
      }
    }
    searchFrom = pos;
  }
  return results;
}

// 10. Split XML into top-level elements respecting nesting depth ――――――――――――――――――――――――――――――――――
// E.g. for body content, returns each direct child element as a string.
// 12. Split top level elements ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function splitTopLevelElements(xml: string): string[] {
  const elements: string[] = [];
  let depth = 0;
  let currentStart = -1;

  // Simple state machine: track < > and nesting
  let i = 0;
  while (i < xml.length) {
    if (xml[i] === "<") {
      // Check what kind of tag
      if (xml[i + 1] === "/") {
        // Closing tag
        depth--;
        if (depth === 0) {
          // Find end of this closing tag
          const closeEnd = xml.indexOf(">", i);
          if (closeEnd === -1) {
            break; // malformed XML — bail out
          }
          if (currentStart !== -1) {
            elements.push(xml.slice(currentStart, closeEnd + 1).trim());
            currentStart = -1;
          }
          i = closeEnd + 1;
          continue;
        }
      }
      else if (xml[i + 1] === "?" || xml[i + 1] === "!") {
        // Processing instruction or comment — skip
        const end = xml.indexOf(">", i);
        if (end === -1) {
          break; // malformed XML — bail out
        }
        i = end + 1;
        continue;
      }
      else {
        // Opening tag
        if (depth === 0) {
          currentStart = i;
        }
        // Check for self-closing
        const tagEnd = xml.indexOf(">", i);
        if (tagEnd === -1) {
          break; // malformed XML — bail out
        }
        if (xml[tagEnd - 1] === "/") {
          // Self-closing
          if (depth === 0) {
            elements.push(xml.slice(currentStart, tagEnd + 1).trim());
            currentStart = -1;
            i = tagEnd + 1;
            continue;
          }
        }
        else {
          depth++;
        }
        i = tagEnd + 1;
        continue;
      }
    }
    i++;
  }
  return elements.filter((e) => e.length > 0);
}

// 13. Extract header footer outline ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractHeaderFooterOutline(zip: PizZip): string {
  const parts: string[] = [];
  const zipFiles = zip.files;

  for (const relativePath of Object.keys(zipFiles)) {
    if ((relativePath.startsWith("word/header") || relativePath.startsWith("word/footer")) && relativePath.endsWith(".xml")) {
      try {
        const xml = zipFiles[relativePath].asText();
        const text = extractAllText(xml);
        const name = relativePath.replace("word/", "");
        if (text) {
          parts.push(`${name}: "${text.length > 100 ? `${text.slice(0, 100)}...` : text}"`);
        }
        else {
          parts.push(`${name}: (no text content)`);
        }
      }
      catch {
        /* skip */
      }
    }
  }
  return parts.length > 0 ? `\n\nHeaders/Footers:\n${parts.join("\n")}` : "";
}

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// DOCX creation helpers
// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 14. Escape XML ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// 15. Create minimal docx zip ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createMinimalDocxZip(documentXml: string): PizZip {
  const zip = new PizZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );

  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:docDefaults><w:rPrDefault><w:rPr>` +
      `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>` +
      `<w:sz w:val="22"/><w:szCs w:val="22"/>` +
      `</w:rPr></w:rPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>` +
      `</w:styles>`,
  );

  zip.file("word/document.xml", documentXml);

  return zip;
}

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Count occurrences helper
// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 16. Count occurrences ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    count++;
    pos = haystack.indexOf(needle, pos + 1);
  }
  return count;
}

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// DocxFileHandler — implements FileHandler
// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

// 17. Docx file handler ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export class DocxFileHandler implements FileHandler {
  private readonly extensions = [".docx"];

  // 18. Can handle ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  canHandle(path: string): boolean {
    return this.extensions.some((e) => path.toLowerCase().endsWith(e));
  }

  // 12. Read DOCX content ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Default (offset=0, no explicit length or default length): returns outline
  // With offset/length: returns raw pretty-printed XML with line pagination

  // 19. Read ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async read(path: string, options?: ReadOptions): Promise<FileResult> {
    const buf = await fs.readFile(path);
    const { zip, documentXml } = loadDocxZip(buf);
    const pretty = prettyPrintXml(documentXml);
    const allLines = pretty.split("\n");
    const totalLines = allLines.length;
    const offset = options?.offset ?? 0;
    const length = options?.length;

    // If user explicitly requests non-zero offset, give raw XML with pagination
    const wantsRaw = offset !== 0;

    if (wantsRaw) {
      let startLine: number;
      let sliceLength: number;

      if (offset < 0) {
        startLine = Math.max(0, totalLines + offset);
        sliceLength = totalLines - startLine;
      }
      else {
        startLine = offset;
        sliceLength = length ?? totalLines;
      }
      const sliced = allLines.slice(startLine, startLine + sliceLength);
      const remaining = totalLines - (startLine + sliced.length);
      const status = `DOCX XML: lines ${startLine}-${startLine + sliced.length - 1} of ${totalLines} (${remaining} remaining)`;

      return {
        content: `${status}\n${sliced.join("\n")}`,
        mimeType: "application/xml",
        metadata: { isDocx: true, lineCount: totalLines },
      };
    }
    // Default: return outline
    const outline = extractOutline(documentXml);
    const headerFooterInfo = extractHeaderFooterOutline(zip);
    const rawSizeKB = (documentXml.length / 1024).toFixed(1);

    return {
      content: `${outline + headerFooterInfo}\n\nRaw XML: ${totalLines} lines, ${rawSizeKB}KB.\nFor bulk changes (translation, mass find/replace): use start_process with a Python script using zipfile to edit <w:t> elements.`,
      mimeType: "text/plain",
      metadata: { isDocx: true, lineCount: totalLines },
    };
  }

  // 13. Write/create a DOCX file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Content is plain text — each line becomes a paragraph.
  // Lines starting with # become headings (# = Heading1, ## = Heading2, etc.)

  // 20. Write ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async write(path: string, content: unknown, mode?: "rewrite" | "append"): Promise<void> {
    if (mode === "append") {
      throw new Error("DOCX append not supported. Use edit_block to modify existing DOCX files.");
    }
    const text = typeof content === "string" ? content : String(content);
    const lines = text.split("\n");

    // Build paragraph XML from lines
    const paragraphs: string[] = [];
    for (const line of lines) {
      const headingMatch = line.match(MARKDOWN_HEADING_PATTERN);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` + `<w:r><w:t>${escapeXml(headingText)}</w:t></w:r></w:p>`);
      }
      else if (line.trim() === "") {
        paragraphs.push(`<w:p/>`);
      }
      else {
        paragraphs.push(`<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`);
      }
    }
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

    const zip = createMinimalDocxZip(docXml);
    const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    await fs.writeFile(path, buf);
  }

  // 14. Edit DOCX via find/replace on pretty-printed XML ――――――――――――――――――――――――――――――――――――――――――
  // Works on the same representation that read() returns when using offset/length,
  // so XML fragments copied from read output work as search strings.
  // After editing, XML is compacted and repacked into the DOCX.

  // 21. Edit range ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async editRange(path: string, _range: string, content: unknown, _options?: Record<string, unknown>): Promise<EditResult> {
    try {
      let oldStr: string;
      let newStr: string;
      let expectedReplacements = 1;

      if (isDocxEditContent(content)) {
        oldStr = content.oldStr ?? content.old_string ?? content.search ?? "";
        newStr = content.newStr ?? content.new_string ?? content.replace ?? "";
        expectedReplacements = content.expectedReplacements ?? content.expected_replacements ?? 1;
      }
      else {
        return {
          success: false,
          editsApplied: 0,
          errors: [{ location: "docx", error: "DOCX editing requires old_string and new_string" }],
        };
      }
      if (!oldStr) {
        return {
          success: false,
          editsApplied: 0,
          errors: [{ location: "docx", error: "old_string cannot be empty" }],
        };
      }
      // Load and pretty-print
      const buf = await fs.readFile(path);
      const zip = new PizZip(buf);
      const docFile = zip.file("word/document.xml");
      if (!docFile) {
        throw new Error("Invalid DOCX: missing word/document.xml");
      }
      const rawXml = docFile.asText();
      const pretty = prettyPrintXml(rawXml);

      // Also check headers/footers for the search string
      let targetPretty = pretty;
      let targetFile = "word/document.xml";
      let matchCount = countOccurrences(pretty, oldStr);

      // If not found in document.xml, search through headers/footers
      if (matchCount === 0) {
        for (const xmlPath of HEADER_FOOTER_XML_PARTS) {
          const f = zip.file(xmlPath);
          if (!f) {
            continue;
          }
          const partPretty = prettyPrintXml(f.asText());
          const c = countOccurrences(partPretty, oldStr);
          if (c > 0) {
            targetPretty = partPretty;
            targetFile = xmlPath;
            matchCount = c;
            break;
          }
        }
      }
      if (matchCount === 0) {
        return {
          success: false,
          editsApplied: 0,
          errors: [{ location: targetFile, error: `Search string not found in DOCX` }],
        };
      }
      if (matchCount !== expectedReplacements) {
        return {
          success: false,
          editsApplied: 0,
          errors: [
            {
              location: targetFile,
              error: `Expected ${expectedReplacements} occurrence(s) but found ${matchCount}. Set expected_replacements to ${matchCount} to replace all, or add more context to make the search unique.`,
            },
          ],
        };
      }
      // Apply replacement
      let edited = targetPretty;
      if (expectedReplacements === 1) {
        const idx = edited.indexOf(oldStr);
        edited = edited.slice(0, idx) + newStr + edited.slice(idx + oldStr.length);
      }
      else {
        edited = edited.split(oldStr).join(newStr);
      }
      // Compact and repack
      const compacted = compactXml(edited);
      zip.file(targetFile, compacted);

      const outBuf = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      await fs.writeFile(path, outBuf);

      return { success: true, editsApplied: matchCount };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        editsApplied: 0,
        errors: [{ location: "docx", error: errorMessage }],
      };
    }
  }

  // 15. Get DOCX file info ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getInfo(path: string): Promise<FileInfo> {
    const stats = await fs.stat(path);

    let metadata: FileInfo["metadata"] = { isDocx: true };
    try {
      const buf = await fs.readFile(path);
      const { documentXml } = loadDocxZip(buf);
      const text = extractAllText(documentXml);
      const wordCount = text.split(WORD_SPLIT_PATTERN).filter((w) => w.length > 0).length;
      const paragraphCount = (documentXml.match(WORD_PARAGRAPH_TAG_PATTERN) || []).length;
      const tableCount = (documentXml.match(WORD_TABLE_TAG_PATTERN) || []).length;
      const imageCount = (documentXml.match(WORD_IMAGE_TAG_PATTERN) || []).length;

      metadata = {
        isDocx: true,
        paragraphCount,
        tableCount,
        imageCount,
        wordCount,
      };
    }
    catch {
      /* return basic info */
    }
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: false,
      isFile: true,
      permissions: (stats.mode & 0o777).toString(8),
      fileType: "docx",
      metadata,
    };
  }
}
