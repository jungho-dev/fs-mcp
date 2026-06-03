/**
 * @file src/controllers/controllers-filesystem.ts
 * @description MCP filesystem tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";
import type { ReadOptions } from "@assets/readers/readers-base";
import { resolvePreviewFileType as rslPrFlTy } from "@assets/readers/readers-filetypes";
import type { DirectoryListingEntryType as DirLsEnTy, ServerResult } from "@assets/type/common";
import { withTimeout } from "@assets/utils/utils-timeout";
import { type BatchToolItemResult as BtchTlItmRes, createBatchToolResponse as crtBtchTlRes, runLimitedParallelBatch as rnLmPrBt, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { createErrorResponse as crtErrRes } from "@cores/responses/responses-error";
import { resolveAbsolutePath as rslvAbslPth } from "@features/filesystem/filesystem-path-resolver";
import { copyFile, createDirectory as crtDir, getFileInfo, listDirectory as lstDir, moveFile, readFileInternal as rdFlInt, readTextSliceInternal as rdTxtSlcInt, readFile, removePath, writeFile } from "@features/filesystem/filesystem-service";
import { CpyFlArgsSch, CpyFlArSc, CrtDiArSc, CrtDrArSc, GtFlInArSc, GtFlInArSc2, LstDiArSc, LstDrArSc, MvFlArgsSch, MvFlsArgsSch, RdFlArgsSch, RdFlsArgsSch, RmvFlArSc, RmvPtArSc, WrtFlArFrAr2, WrtFlArFrArP, WrtFlArgsSch, WrtFlArSc } from "@schemas/schemas-filesystem";

const DLEP = /^(?:\[(F|D|W|X)\]|(□|■))\s*(.*)$/;
const LN_SPLT_PAT = /\r\n|\r|\n/;
const MPER = /\b(?:ENOENT|ENOTDIR)\b/;
const WSL_UNC_ERR = /^Failed to (?:resolve symlink|inspect target path) for path: \\\\/;
const WSL_UNC_MISS = /\b(?:EUNKNOWN|ECONNRESET)\b/;
const RFHTM = 60_000;
const MFBC = process.platform === "win32" ? 1 : 4;
const ASMF = "__fs_mcp_args_source";

type ParsedReadFileArgs = {
  isUrl: boolean;
  length?: number;
  offset: number;
  path: string;
};
type ParsedWriteFileArgs = {
  content?: string;
  content_length?: number;
  content_offset: number;
  content_path?: string;
  mode: "append" | "rewrite";
  path: string;
};
type ParsedCreateDirectoryArgs = {
  path: string;
};
type ParsedListDirectoryArgs = {
  depth: number;
  excludePatterns: string[];
  includeFiles: boolean;
  maxEntries?: number;
  path: string;
};
type ParsedCopyFileArgs = {
  destination: string;
  force: boolean;
  recursive: boolean;
  source: string;
};
type ParsedMoveFileArgs = {
  destination: string;
  source: string;
};
type ParsedRemovePathArgs = {
  force: boolean;
  path: string;
  recursive: boolean;
};
type ParsedGetFileInfoArgs = {
  path: string;
};
type LineNumTextContent = {
  endLine: number | null;
  lineCount: number;
  startLine: number | null;
  textContent: string;
};

type ToolArgsSource = "args_path" | "inline";

// 1. Missing path error check ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isMissingPathError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
  const message = error instanceof Error ? error.message : String(error);

  return code === "ENOENT" || code === "ENOTDIR" || MPER.test(message) || (WSL_UNC_ERR.test(message) && WSL_UNC_MISS.test(message));
}
// 1-1. Create missing path response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createMissingPathResponse(rqstPth: string): ServerResult {
  const resolvedPath = rslvAbslPth(rqstPth);

  return {
    content: [{ type: "text", text: `Missing path: ${rqstPth}` }],
    structuredContent: {
      fileName: path.basename(resolvedPath),
      filePath: resolvedPath,
      fileType: "missing",
      missing: true,
      path: rqstPth,
      reason: "not_found",
    },
  };
}
// 1-2. Missing local path check ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function isMissingLocalPath(rqstPth: string): Promise<boolean> {
  try {
    await getFileInfo(rqstPth);
    return false;
  }
  catch (error) {
    if (isMissingPathError(error)) {
    	return true;
    }
    throw error;
  }
}
// 1. Resolve directory listing entry type ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveDirectoryListingEntryType(match: RegExpMatchArray | null): DirLsEnTy {
  if (!match) {
  	return "unknown";
  }
  const bracketType = match[1]?.toLowerCase();
  if (bracketType === "f") {
  	return "file";
  }
  if (bracketType === "d") {
  	return "dir";
  }
  if (bracketType === "w") {
  	return "warning";
  }
  if (bracketType === "x") {
  	return "denied";
  }
  return "unknown";
}
// 2. Handle parsed read file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedReadFile(parsed: ParsedReadFileArgs): Promise<ServerResult> {
  const options: ReadOptions = {
    isUrl: parsed.isUrl,
    offset: parsed.offset,
    length: parsed.length,
  };

  // Resolve to absolute path for local files (not URLs) so "Open in folder" works
  const rslvFlPth = parsed.isUrl ? parsed.path : rslvAbslPth(parsed.path);

  const fileResult = await readFile(parsed.path, options);

  // Handle image files
  if (fileResult.metadata?.isImage) {
    // For image files, keep content payload text-only for broad host compatibility.
    // The preview widget reads image bytes from structuredContent.
    const imageData = typeof fileResult.content === "string" ? fileResult.content : fileResult.content.toString("base64");
    const imageSummary = `Image file: ${parsed.path} (${fileResult.mimeType})\n`;
    return {
      content: [
        {
          type: "text",
          text: imageSummary,
        },
      ],
      structuredContent: {
        fileName: path.basename(rslvFlPth),
        filePath: rslvFlPth,
        fileType: "image",
        imageData,
        mimeType: fileResult.mimeType,
      },
    };
  }
  else {
    // For all other files, return as text.
    // structuredContent mirrors text for preview hosts that prefer metadata payloads.
    const textContent = typeof fileResult.content === "string" ? fileResult.content : fileResult.content.toString("utf8");
    const fileType = fileResult.metadata?.isDirectory ? ("directory" as const) : rslPrFlTy(rslvFlPth);
    return {
      content: [{ type: "text", text: textContent }],
      structuredContent: {
        fileName: path.basename(rslvFlPth),
        filePath: rslvFlPth,
        fileType,
        textContent,
      },
    };
  }
}
// 3. Handle parsed read file with timeout ――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedReadFileWithTimeout(parsed: ParsedReadFileArgs): Promise<ServerResult> {
  const result = await withTimeout(handleParsedReadFile(parsed), RFHTM, "Read file handler operation", null);
  if (result == null) {
  	// Handles the impossible case where withTimeout resolves to null instead of throwing
    throw new Error("Failed to read the file");
  }
  return result;
}
// 3-1. Handle parsed read file with missing path option ――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedReadFileWithMissing(parsed: ParsedReadFileArgs, allowMissing: boolean): Promise<ServerResult> {
  try {
    return await handleParsedReadFileWithTimeout(parsed);
  }
  catch (error) {
    if (allowMissing && !parsed.isUrl && isMissingPathError(error)) {
    	return createMissingPathResponse(parsed.path);
    }
    throw error;
  }
}
// 3-2. Split line number content ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function splitLineNumContent(content: string): string[] {
  const lines = content.split(LN_SPLT_PAT);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}
// 3-3. Resolve line number slice ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveLineNumSlice(lines: string[], offset: number, length?: number): { selected: string[]; startLine: number | null } {
  if (lines.length === 0) {
    return {
      selected: [],
      startLine: null,
    };
  }
  if (offset < 0) {
    const startIndex = Math.max(0, lines.length + offset);
    const selected = lines.slice(startIndex);

    return {
      selected,
      startLine: selected.length > 0 ? startIndex + 1 : null,
    };
  }
  const startIndex = Math.max(0, offset);
  const selected = length === undefined ? lines.slice(startIndex) : lines.slice(startIndex, startIndex + length);

  return {
    selected,
    startLine: selected.length > 0 ? startIndex + 1 : null,
  };
}
// 3-4. Format line numbered text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatLineNumText(content: string, offset: number, length?: number): LineNumTextContent {
  const lines = splitLineNumContent(content);
  const slice = resolveLineNumSlice(lines, offset, length);
  const textContent = slice.selected
    .map((line, index) => `${(slice.startLine ?? 1) + index}: ${line}`)
    .join("\n");

  return {
    endLine: slice.startLine === null ? null : slice.startLine + slice.selected.length - 1,
    lineCount: slice.selected.length,
    startLine: slice.startLine,
    textContent,
  };
}
// 3-5. Handle parsed line numbered read ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedLineNumRead(parsed: ParsedReadFileArgs): Promise<ServerResult> {
  const rslvFlPth = parsed.isUrl ? parsed.path : rslvAbslPth(parsed.path);
  const rawContent = parsed.isUrl
    ? await readFile(parsed.path, { isUrl: true })
    : { content: await rdFlInt(parsed.path), metadata: {}, mimeType: "text/plain" };

  if (rawContent.metadata?.isImage || rawContent.metadata?.isBinary) {
    throw new Error(`Cannot add line numbers to non-text content: ${parsed.path}`);
  }
  const content = typeof rawContent.content === "string" ? rawContent.content : rawContent.content.toString("utf8");
  const numbered = formatLineNumText(content, parsed.offset, parsed.length);
  const fileType = rslPrFlTy(rslvFlPth);

  return {
    content: [{ type: "text", text: numbered.textContent }],
    structuredContent: {
      endLine: numbered.endLine,
      fileName: path.basename(rslvFlPth),
      filePath: rslvFlPth,
      fileType,
      lineCount: numbered.lineCount,
      startLine: numbered.startLine,
      textContent: numbered.textContent,
    },
  };
}
// 3-6. Handle parsed line numbered read with missing path option ―――――――――――――――――――――――――――――――――――――
async function handleParsedLineNumReadWithMissing(parsed: ParsedReadFileArgs, allowMissing: boolean): Promise<ServerResult> {
  try {
    return await handleParsedLineNumRead(parsed);
  }
  catch (error) {
    if (allowMissing && !parsed.isUrl && isMissingPathError(error)) {
      return createMissingPathResponse(parsed.path);
    }
    throw error;
  }
}
// 4. Handle read file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFile(args: unknown): Promise<ServerResult> {
  // Add input validation
  if (args === null || args === undefined) {
  	return crtErrRes("No arguments provided for read_file command");
  }
  const parsed = RdFlArgsSch.parse(args);

  return await handleParsedReadFileWithTimeout(parsed);
}
// 5. Is tool args record ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isToolArgsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// 6. Resolve tool args source ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveToolArgsSource(args: unknown): ToolArgsSource {
  if (!isToolArgsRecord(args) || args[ASMF] !== "args_path") {
  	return "inline";
  }
  return "args_path";
}
// 7. Strip tool args metadata ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function stripToolArgsMetadata(args: unknown): unknown {
  if (!isToolArgsRecord(args) || !Object.hasOwn(args, ASMF)) {
  	return args;
  }
  const { [ASMF]: _argsSource, ...rest } = args;

  return rest;
}
// 3. Resolve write content ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveWriteContent(parsed: ParsedWriteFileArgs): Promise<string> {
  if (parsed.content !== undefined) {
  	return parsed.content;
  }
  return rdTxtSlcInt(parsed.content_path ?? "", parsed.content_offset, parsed.content_length);
}
// 4. Count write lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countWriteLines(content: string): number {
  return content.split("\n").length;
}
// 6. Handle parsed write file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedWriteFile(parsed: ParsedWriteFileArgs): Promise<ServerResult> {
  const content = await resolveWriteContent(parsed);
  const lineCount = countWriteLines(content);

  await writeFile(parsed.path, content, parsed.mode);

  const modeMessage = parsed.mode === "append" ? "appended to" : "wrote to";
  const rslvWrtPth = rslvAbslPth(parsed.path);

  return {
    content: [
      {
        type: "text",
        text: `Successfully ${modeMessage} ${parsed.path} (${lineCount} lines)`,
      },
    ],
    structuredContent: {
      fileName: path.basename(rslvWrtPth),
      filePath: rslvWrtPth,
      fileType: rslPrFlTy(rslvWrtPth),
    },
  };
}
// 7. Handle write file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWriteFile(args: unknown): Promise<ServerResult> {
  try {
    const argsSource = resolveToolArgsSource(args);
    const rawArgs = stripToolArgsMetadata(args);
    const parsed = argsSource === "args_path" ? WrtFlArFrArP.parse(rawArgs) : WrtFlArgsSch.parse(rawArgs);

    return await handleParsedWriteFile(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 8. Handle parsed create directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedCreateDirectory(parsed: ParsedCreateDirectoryArgs): Promise<ServerResult> {
  await crtDir(parsed.path);
  return {
    content: [{ type: "text", text: `Successfully created directory ${parsed.path}` }],
  };
}
// 9. Handle create directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCreateDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = CrtDiArSc.parse(args);

    return await handleParsedCreateDirectory(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 10. Handle parsed list directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedListDirectory(parsed: ParsedListDirectoryArgs): Promise<ServerResult> {
  const entries = await lstDir(parsed.path, parsed.depth, {
    excludePatterns: parsed.excludePatterns,
    includeFiles: parsed.includeFiles,
    maxEntries: parsed.maxEntries,
  });

  const resultText = entries.join("\n");
  const resolvedPath = rslvAbslPth(parsed.path);
  const strcEntr = entries.map((entry) => {
    const match = entry.match(DLEP);

    return {
      type: resolveDirectoryListingEntryType(match),
      path: match ? match[3] : entry,
      text: entry,
    };
  });

  return {
    content: [{ type: "text", text: resultText }],
    structuredContent: {
      fileName: path.basename(resolvedPath),
      filePath: resolvedPath,
      fileType: "directory" as const,
      entries: strcEntr,
      listing: resultText,
    },
  };
}
// 10-1. Handle parsed list directory with missing path option ―――――――――――――――――――――――――――――――――――――――――
async function handleParsedListDirectoryWithMissing(parsed: ParsedListDirectoryArgs, allowMissing: boolean): Promise<ServerResult> {
  if (allowMissing && (await isMissingLocalPath(parsed.path))) {
  	return createMissingPathResponse(parsed.path);
  }
  return await handleParsedListDirectory(parsed);
}
// 11. Handle list directory ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = LstDiArSc.parse(args);

    return await handleParsedListDirectory(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 12. Handle parsed copy file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedCopyFile(parsed: ParsedCopyFileArgs): Promise<ServerResult> {
  await copyFile(parsed.source, parsed.destination, parsed.recursive, parsed.force);
  return {
    content: [{ type: "text", text: `Successfully copied ${parsed.source} to ${parsed.destination}` }],
  };
}
// 13. Handle copy file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCopyFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = CpyFlArgsSch.parse(args);

    return await handleParsedCopyFile(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 14. Handle parsed move file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedMoveFile(parsed: ParsedMoveFileArgs): Promise<ServerResult> {
  await moveFile(parsed.source, parsed.destination);
  return {
    content: [{ type: "text", text: `Successfully moved ${parsed.source} to ${parsed.destination}` }],
  };
}
// 15. Handle move file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleMoveFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = MvFlArgsSch.parse(args);

    return await handleParsedMoveFile(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 19. Handle parsed remove path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedRemovePath(parsed: ParsedRemovePathArgs): Promise<ServerResult> {
  const resolvedPath = rslvAbslPth(parsed.path);

  await removePath(parsed.path, parsed.recursive, parsed.force);
  return {
    content: [{ type: "text", text: `Successfully removed ${parsed.path}` }],
    structuredContent: {
      fileName: path.basename(resolvedPath),
      filePath: resolvedPath,
      fileType: "text" as const,
      recursive: parsed.recursive,
    },
  };
}
// 20. Handle remove path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRemovePath(args: unknown): Promise<ServerResult> {
  try {
    const parsed = RmvPtArSc.parse(args);

    return await handleParsedRemovePath(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 12. Format value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatValue(value: unknown, indent: string=""): string {
  if (value === null || value === undefined) {
  	return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
    	return "[]";
    }
    // For arrays of objects (like sheets), format each item
    const items = value.map((item, i) => {
      if (typeof item === "object" && item !== null) {
        const props = Object.entries(item)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return `${indent}  [${i}] { ${props} }`;
      }
      return `${indent}  [${i}] ${item}`;
    });
    return `\n${items.join("\n")}`;
  }
  if (typeof value === "object") {
  	return JSON.stringify(value);
  }
  return String(value);
}
// 22. Handle parsed get file info ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedGetFileInfo(parsed: ParsedGetFileInfoArgs): Promise<ServerResult> {
  const info = await getFileInfo(parsed.path);

  // Generic formatting for any file type
  const frmtTxt = Object.entries(info)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join("\n");

  return {
    content: [
      {
        type: "text",
        text: frmtTxt,
      },
    ],
    structuredContent: info,
  };
}
// 22-1. Handle parsed get file info with missing path option ――――――――――――――――――――――――――――――――――――――――――
async function handleParsedGetFileInfoWithMissing(parsed: ParsedGetFileInfoArgs, allowMissing: boolean): Promise<ServerResult> {
  try {
    return await handleParsedGetFileInfo(parsed);
  }
  catch (error) {
    if (allowMissing && isMissingPathError(error)) {
    	return createMissingPathResponse(parsed.path);
    }
    throw error;
  }
}
// 23. Handle get file info ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFileInfo(args: unknown): Promise<ServerResult> {
  try {
    const parsed = GtFlInArSc.parse(args);

    return await handleParsedGetFileInfo(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return crtErrRes(errorMessage);
  }
}
// 14. Handle read files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFiles(args: unknown): Promise<ServerResult> {
  const parsed = RdFlsArgsSch.parse(args);
  const items = parsed.items ?? parsed.paths?.map((filePath) => ({ isUrl: false, offset: 0, path: filePath })) ?? [];
  const results = await rnPrllBtch(items, (item) => handleParsedReadFileWithMissing(item, parsed.allowMissing));
  const response = crtBtchTlRes("file-read", results, { resultMode: "full" });

  return response;
}
// 14-1. Handle read files with line number ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFilesWithLineNumber(args: unknown): Promise<ServerResult> {
  const parsed = RdFlsArgsSch.parse(args);
  const items = parsed.items ?? parsed.paths?.map((filePath) => ({ isUrl: false, offset: 0, path: filePath })) ?? [];
  const results = await rnPrllBtch(items, (item) => handleParsedLineNumReadWithMissing(item, parsed.allowMissing));
  const response = crtBtchTlRes("file-lines", results, { resultMode: "full" });

  return response;
}
// 15. Is record ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// 16. Compact write batch input ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactWriteBatchInput(input: ParsedWriteFileArgs): Record<string, unknown> {
  const compacted: Record<string, unknown> = {
    content_offset: input.content_offset,
    mode: input.mode,
    path: input.path,
  };

  if (input.content !== undefined) {
  	compacted.contentLength = input.content.length;
  }
  if (input.content_path !== undefined) {
  	compacted.content_path = input.content_path;
  }
  if (input.content_length !== undefined) {
  	compacted.content_length = input.content_length;
  }
  return compacted;
}
// 17. Compact write batch result ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactWriteBatchResult(result: ServerResult): ServerResult {
  if (result.isError === true || !isRecord(result.structuredContent)) {
  	return result;
  }
  const fileName = typeof result.structuredContent.fileName === "string" ? result.structuredContent.fileName : "file";
  const filePath = typeof result.structuredContent.filePath === "string" ? result.structuredContent.filePath : "";
  const fileType = typeof result.structuredContent.fileType === "string" ? result.structuredContent.fileType : "text";

  return {
    content: [{ type: "text", text: `Successfully wrote ${fileName}` }],
    structuredContent: {
      fileName,
      filePath,
      fileType,
    },
  };
}
// 18. Create write files batch response ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createWriteFilesBatchResponse(items: BtchTlItmRes<ParsedWriteFileArgs>[]): ServerResult {
  const totalCount = items.length;
  const failedCount = items.filter((item) => !item.ok).length;
  const sccdCnt = totalCount - failedCount;
  const summaryLines = items.map((item) => {
    const statusText = item.ok ? "OK" : "ERROR";
    return `- [${item.index}] ${statusText} ${path.basename(item.input.path)}`;
  });

  return {
    content: [
      {
        type: "text",
        text: `"file-write": ${sccdCnt}/${totalCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ""}\n\n${summaryLines.join("\n")}`,
      },
    ],
    structuredContent: {
      failedCount,
      results: items.map((item) => ({
        index: item.index,
        input: compactWriteBatchInput(item.input),
        ok: item.ok,
        result: compactWriteBatchResult(item.result),
      })),
      succeededCount: sccdCnt,
      toolName: "file-write",
      totalCount,
    },
  };
}
// 19. Handle write files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWriteFiles(args: unknown): Promise<ServerResult> {
  const argsSource = resolveToolArgsSource(args);
  const rawArgs = stripToolArgsMetadata(args);
  const parsed = argsSource === "args_path" ? WrtFlArFrAr2.parse(rawArgs) : WrtFlArSc.parse(rawArgs);
  const results = await rnPrllBtch(parsed.items, (item) => handleParsedWriteFile(item));

  return createWriteFilesBatchResponse(results);
}
// 16. Handle create directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCreateDirectories(args: unknown): Promise<ServerResult> {
  const parsed = CrtDrArSc.parse(args);
  const results = await rnPrllBtch(parsed.paths, (dirPath) => handleParsedCreateDirectory({ path: dirPath }));
  const response = crtBtchTlRes("dir-mk", results);

  return response;
}
// 17. Handle list directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListDirectories(args: unknown): Promise<ServerResult> {
  const parsed = LstDrArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleParsedListDirectoryWithMissing(item, parsed.allowMissing));
  const response = crtBtchTlRes("dir-list", results, { resultMode: "full" });

  return response;
}
// 18. Handle copy files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCopyFiles(args: unknown): Promise<ServerResult> {
  const parsed = CpyFlArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleParsedCopyFile(item));
  const response = crtBtchTlRes("file-copy", results);

  return response;
}
// 19. Handle move files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleMoveFiles(args: unknown): Promise<ServerResult> {
  const parsed = MvFlsArgsSch.parse(args);
  const results = await rnLmPrBt(parsed.items, MFBC, (item) => handleParsedMoveFile(item));
  const response = crtBtchTlRes("file-move", results);

  return response;
}
// 21. Handle remove files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRemoveFiles(args: unknown): Promise<ServerResult> {
  const parsed = RmvFlArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => handleParsedRemovePath(item));
  const response = crtBtchTlRes("file-remove", results);

  return response;
}
// 22. Handle get file infos ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFileInfos(args: unknown): Promise<ServerResult> {
  const parsed = GtFlInArSc2.parse(args);
  const results = await rnPrllBtch(parsed.paths, (filePath) => handleParsedGetFileInfoWithMissing({ path: filePath }, parsed.allowMissing));
  const response = crtBtchTlRes("file-infos", results);

  return response;
}
