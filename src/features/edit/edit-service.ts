/**
 * @file src/features/edit/edit-service.ts
 * @description Edit operation service.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Text file editing via search/replace with fuzzy matching support.

import path from "node:path";
import {resolvePreviewFileType as rslPrFlTy} from "@assets/readers/readers-filetypes";
import type {ServerResult} from "@assets/type/common";
import {createErrorResponse as crtErrRes} from "@cores/responses/responses-error";
import {detectLineEnding as dtctLnEndn, normalizeLineEndings as nrmlLnEndn2} from "@features/edit/edit-line-ending-policy";
import {resolveAbsolutePath as rslvAbslPth} from "@features/filesystem/filesystem-path-resolver";
import {readFileInternal as rdFlInt, readTextSliceInternal as rdTxtSlcInt, validatePath, writeFile} from "@features/filesystem/filesystem-service";
import {getSimilarityRatio as gtSmlrRt, recursiveFuzzyIndexOf as rcrFzIdOf} from "@features/search/search-fuzzy-matcher";
import {type FuzzySearchLogEntry as FzzSrLgEn, fzzySrchLggr} from "@features/search/search-log";
import {EdtBlArSc2} from "@schemas/schemas-edit";

interface SearchReplace {
  replace: string;
  search: string;
}
// Threshold for fuzzy matching - similarity must be at least this value to be considered
// (0-1 scale where 1 is perfect match and 0 is completely different).
// Override via env FS_MCP_EDIT_FUZZY_THRESHOLD when callers need a stricter or looser bound.
function resolveFuzzyThreshold(): number {
  const raw = process.env.FS_MCP_EDIT_FUZZY_THRESHOLD;
  if (raw === undefined || raw === "") {
    return 0.7;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return 0.7;
  }
  return parsed;
}
const FZZY_THRS = resolveFuzzyThreshold();

// 1. Extract character code data from diff ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param expected The string that was searched for
// @param actual The string that was found
// @returns Character code statistics

// 1. Get character code data ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getCharacterCodeData(
  expected: string,
  actual: string,
): {
  report: string;
  uniqueCount: number;
  diffLength: number;
} {
  // Find common prefix and suffix
  let prefixLength = 0;
  const minLength = Math.min(expected.length, actual.length);

  // Determine common prefix length
  while (prefixLength < minLength && expected[prefixLength] === actual[prefixLength]) {
    prefixLength++;
  }
  // Determine common suffix length
  let suffixLength = 0;
  while (suffixLength < minLength - prefixLength && expected.at(1 + suffixLength) === actual.at(1 + suffixLength)) {
    suffixLength++;
  }
  // Extract the different parts
  const expectedDiff = expected.slice(prefixLength, expected.length - suffixLength);
  const actualDiff = actual.slice(prefixLength, actual.length - suffixLength);

  // Count unique character codes in the diff
  const chrcCds = new Map<number, number>();
  const fullDiff = expectedDiff + actualDiff;

  for (const character of fullDiff.split("")) {
    const charCode = character.charCodeAt(0);
    chrcCds.set(charCode, (chrcCds.get(charCode) || 0) + 1);
  }
  // Create character codes string report
  const chrCdRprt: string[] = [];
  chrcCds.forEach((count, code) => {
    // Include character representation for better readability
    const char = String.fromCharCode(code);
    // Make special characters more readable
    const charDisplay = code < 32 || code > 126 ? `\\x${code.toString(16).padStart(2, "0")}` : char;
    chrCdRprt.push(`${code}:${count}[${charDisplay}]`);
  });

  // Sort by character code for consistency
  chrCdRprt.sort((a, b) => {
    const codeA = Number.parseInt(a.split(":")[0], 10);
    const codeB = Number.parseInt(b.split(":")[0], 10);
    return codeA - codeB;
  });

  return {
    diffLength: fullDiff.length,
    report: chrCdRprt.join(","),
    uniqueCount: chrcCds.size,
  };
}

// 2. Perform search replace ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function performSearchReplace(filePath: string, block: SearchReplace, expRplc: number=1): Promise<ServerResult> {
  // Get file extension for diagnostics using path module.
  const flExt2 = path.extname(filePath).toLowerCase();

  // Report file extension and string sizes without capturing the file path.
  // Check for empty search string to prevent infinite loops
  if (block.search === "") {
    // Report file extension without capturing the file path.
    return {
      content: [
        {
          text: "Empty search strings are not allowed. Please provide a non-empty string to search for.",
          type: "text",
        },
      ],
    };
  }
  // Read file directly to preserve line endings - critical for edit operations
  const validPath = await validatePath(filePath);
  const content = await rdFlInt(validPath, 0, Number.MAX_SAFE_INTEGER);

  // Make sure content is a string
  if (typeof content !== "string") {
    throw new Error(`Wrong content for file ${filePath}`);
  }

  // Detect file's line ending style
  const flLnEndn = dtctLnEndn(content);

  // Normalize search string to match file's line endings
  const normSrch = nrmlLnEndn2(block.search, flLnEndn);

  // First try exact match
  const tempContent = content;
  let count = 0;
  let pos = tempContent.indexOf(normSrch);

  while (pos !== -1) {
    count++;
    pos = tempContent.indexOf(normSrch, pos + 1);
  }
  // If exact match found and count matches expected replacements, proceed with exact replacement
  if (count > 0 && count === expRplc) {
    // Replace all occurrences
    let newContent = content;

    // If we're only replacing one occurrence, replace it directly
    if (expRplc === 1) {
      const searchIndex = newContent.indexOf(normSrch);
      newContent = newContent.slice(0, searchIndex) + nrmlLnEndn2(block.replace, flLnEndn) + newContent.slice(searchIndex + normSrch.length);
    }
    else {
      // Replace all occurrences using split and join for multiple replacements
      newContent = newContent.split(normSrch).join(nrmlLnEndn2(block.replace, flLnEndn));
    }
    await writeFile(filePath, newContent);
    const rslvEdtPth = rslvAbslPth(filePath);

    // Show a partial preview centered on the edited area
    const newLines = newContent.split("\n");
    const totalLines = newLines.length;
    const changePos = content.indexOf(normSrch);
    const chgStrtLn = changePos >= 0 ? newContent.slice(0, changePos).split("\n").length - 1 : 0;
    const chgLnCnt = block.replace.split("\n").length;
    const contextLines = 10;
    const previewStart = Math.max(0, chgStrtLn - contextLines);
    const previewEnd = Math.min(totalLines, chgStrtLn + chgLnCnt + contextLines);
    const prvwCont = newLines.slice(previewStart, previewEnd).join("\n");
    const prvwLnCnt = previewEnd - previewStart;
    const remaining = totalLines - previewEnd;
    const statusLine = `Reading ${prvwLnCnt} lines from ${previewStart === 0 ? "start" : `line ${previewStart}`} (total: ${totalLines} lines, ${remaining} remaining)\n\n`;

    return {
      content: [
        {
          text: `${statusLine}${prvwCont}`,
          type: "text",
        },
      ],
      structuredContent: {
        fileName: path.basename(rslvEdtPth),
        filePath: rslvEdtPth,
        fileType: rslPrFlTy(rslvEdtPth),
      },
    };
  }
  // If exact match found but count doesn't match expected, inform the user
  if (count > 0 && count !== expRplc) {
    return {
      content: [
        {
          text: `Expected ${expRplc} occurrences but found ${count} in ${filePath}. Double check and make sure you understand all occurencies and if you want to replace all ${count} occurrences, set expected_replacements to ${count}. If there are many occurrancies and you want to change some of them and keep the rest. Do it one by one, by adding more lines around each occurrence.If you want to replace a specific occurrence, make your search string more unique by adding more lines around search string.`,
          type: "text",
        },
      ],
    };
  }
  // If exact match not found, try fuzzy search
  if (count === 0) {
    // Track fuzzy search time
    const startTime = performance.now();

    // Perform fuzzy search
    const fuzzyResult = rcrFzIdOf(content, block.search);
    const similarity = gtSmlrRt(block.search, fuzzyResult.value);

    // Calculate execution time in milliseconds
    const exctTm = performance.now() - startTime;

    // Generate diff and gather character code data
    const diff = highlightDifferences(block.search, fuzzyResult.value);

    // Count character codes in diff
    const chrcCdDt = getCharacterCodeData(block.search, fuzzyResult.value);

    // Create comprehensive log entry
    const logEntry: FzzSrLgEn = {
      belowThreshold: similarity < FZZY_THRS,
      characterCodes: chrcCdDt.report,
      diff: diff,
      diffLength: chrcCdDt.diffLength,
      exactMatchCount: count,
      executionTime: exctTm,
      expectedReplacements: expRplc,
      fileExtension: flExt2,
      foundLength: fuzzyResult.value.length,
      foundText: fuzzyResult.value,
      fuzzyThreshold: FZZY_THRS,
      searchLength: block.search.length,
      searchText: block.search,
      similarity: similarity,
      timestamp: new Date(),
      uniqueCharacterCount: chrcCdDt.uniqueCount,
    };

    // Log to file
    await fzzySrchLggr.log(logEntry);

    // Check if the fuzzy match is "close enough"
    if (similarity >= FZZY_THRS) {
      // Capture the fuzzy search event with all data

      // If we allow fuzzy matches, we would make the replacement here
      // For now, we'll return a detailed message about the fuzzy match
      return {
        content: [
          {
            text: `Exact match not found, but found a similar text with ${Math.round(similarity * 100)}% similarity (found in ${exctTm.toFixed(2)}ms):\n\nDifferences:\n${diff}\n\nTo replace this text, use the exact text found in the file.\n\nLog entry saved for analysis. Use the following command to check the log:\nCheck log: ${await fzzySrchLggr.getLogPath()}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
    else {
      // If the fuzzy match isn't close enough
      // Still capture the fuzzy search event with all data

      return {
        content: [
          {
            text: `Search content not found in ${filePath}. The closest match was "${fuzzyResult.value}" with only ${Math.round(similarity * 100)}% similarity, which is below the ${Math.round(FZZY_THRS * 100)}% threshold. (Fuzzy search completed in ${exctTm.toFixed(2)}ms)\n\nLog entry saved for analysis. Use the following command to check the log:\nCheck log: ${await fzzySrchLggr.getLogPath()}`,
            type: "text",
          },
        ],
      };
    }
  }
  throw new Error("Unexpected error during search and replace operation.");
}

// 2. Character diff formatter ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param expected The string that was searched for
// @param actual The string that was found
// @returns A formatted string showing character-level differences

// 3. Highlight differences ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function highlightDifferences(expected: string, actual: string): string {
  // Implementation of a simplified character-level diff

  // Find common prefix and suffix
  let prefixLength = 0;
  const minLength = Math.min(expected.length, actual.length);

  // Determine common prefix length
  while (prefixLength < minLength && expected[prefixLength] === actual[prefixLength]) {
    prefixLength++;
  }
  // Determine common suffix length
  let suffixLength = 0;
  while (suffixLength < minLength - prefixLength && expected.at(1 + suffixLength) === actual.at(1 + suffixLength)) {
    suffixLength++;
  }
  // Extract the common and different parts
  const commonPrefix = expected.slice(0, prefixLength);
  const commonSuffix = expected.slice(expected.length - suffixLength);

  const expectedDiff = expected.slice(prefixLength, expected.length - suffixLength);
  const actualDiff = actual.slice(prefixLength, actual.length - suffixLength);

  // Format the output as a character-level diff
  return `${commonPrefix}{-${expectedDiff}-}{+${actualDiff}+}${commonSuffix}`;
}

// 4. Resolve edit text argument ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveEditTextArgument(value: string | undefined, filePath: string | undefined, offset: number, length: number | undefined, label: string): Promise<string> {
  if (value !== undefined) {
    return value;
  }
  if (filePath === undefined) {
    throw new Error(`${label} or ${label}_path is required`);
  }
  return rdTxtSlcInt(filePath, offset, length);
}

// 3. Handle edit_block command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// 1. Text files: String replacement (old_string/new_string)
// - Uses fuzzy matching for resilience
// - Handles expected_replacements parameter

// 4. Handle edit block ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleEditBlock(args: unknown): Promise<ServerResult> {
  const parsed = EdtBlArSc2.parse(args);
  const oldString = await resolveEditTextArgument(parsed.old_string, parsed.old_string_path, parsed.old_string_offset, parsed.old_string_length, "old_string");
  const newString = await resolveEditTextArgument(parsed.new_string, parsed.new_string_path, parsed.new_string_offset, parsed.new_string_length, "new_string");

  // Validate path and resolve handler once.
  let vldtPth: string;
  let handler: Awaited<ReturnType<typeof import("@assets/readers/readers-factory").getFileHandler>>;
  try {
    vldtPth = await validatePath(parsed.file_path);
    const {getFileHandler: gtFlHdl} = await import("@assets/readers/readers-factory");
    handler = await gtFlHdl(vldtPth);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
  const hasEditRange = "editRange" in handler && typeof handler.editRange === "function";

  // If the handler implements editRange it owns text-replacement for its file type
  // (e.g. DocxFileHandler does find/replace on pretty-printed XML rather than raw bytes).
  // Plain text files fall through to performSearchReplace.
  if (hasEditRange) {
    try {
      const result = await handler.editRange?.(vldtPth, "", {
        expected_replacements: parsed.expected_replacements,
        new_string: newString,
        old_string: oldString,
      });

      if (result === undefined) {
        return crtErrRes("File handler did not return an edit result");
      }
      if (result.success) {
        const rslEdRnPt = rslvAbslPth(parsed.file_path);
        return {
          content: [
            {
              text: `Successfully applied ${result.editsApplied} edit(s) to ${parsed.file_path}`,
              type: "text",
            },
          ],
          structuredContent: {
            fileName: path.basename(rslEdRnPt),
            filePath: rslEdRnPt,
            fileType: rslPrFlTy(rslEdRnPt),
          },
        };
      }
      const errorMsg = result.errors?.map((e) => e.error).join("; ") || "Unknown error";
      return crtErrRes(errorMsg);
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return crtErrRes(errorMessage);
    }
  }
  return performSearchReplace(
    parsed.file_path,
    {
      replace: newString,
      search: oldString,
    },
    parsed.expected_replacements,
  );
}
