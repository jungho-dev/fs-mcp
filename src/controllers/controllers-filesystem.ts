/**
 * @file src/controllers/controllers-filesystem.ts
 * @description MCP filesystem tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";
import type { ReadOptions } from "@assets/readers/readers-base";
import { resolvePreviewFileType } from "@assets/readers/readers-filetypes";
import type { DirectoryListingEntryType, ServerResult } from "@assets/type/common";
import { withTimeout } from "@assets/utils/utils-timeout";
import { createBatchToolResponse, type BatchToolItemResult, runLimitedParallelBatch, runParallelBatch } from "@controllers/controllers-batch";
import { createErrorResponse } from "@cores/responses/responses-error";
import { configManager } from "@features/config/config-store";
import { resolveAbsolutePath } from "@features/filesystem/filesystem-path-resolver";
import { copyFile, createDirectory, getFileInfo, listDirectory, moveFile, readFile, readTextSliceInternal, removePath, writeFile } from "@features/filesystem/filesystem-service";
import {
  CopyFileArgsSchema,
  CopyFilesArgsSchema,
  CreateDirectoriesArgsSchema,
  CreateDirectoryArgsSchema,
  GetFileInfoArgsSchema,
  GetFileInfosArgsSchema,
  ListDirectoriesArgsSchema,
  ListDirectoryArgsSchema,
  MoveFileArgsSchema,
  MoveFilesArgsSchema,
  ReadFileArgsSchema,
  ReadFilesArgsSchema,
  RemoveFilesArgsSchema,
  RemovePathArgsSchema,
  RenameFileArgsSchema,
  RenameFilesArgsSchema,
  WriteFileArgsSchema,
  WriteFilesArgsSchema,
} from "@schemas/schemas-filesystem";

const DIRECTORY_LISTING_ENTRY_PATTERN = /^(?:\[(F|D|W|X)\]|(□|■))\s*(.*)$/;
const READ_FILE_HANDLER_TIMEOUT_MS = 60_000;
const MOVE_FILE_BATCH_CONCURRENCY = process.platform === "win32" ? 1 : 4;

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
type ParsedRenameFileArgs = {
  newName: string;
  path: string;
};
type ParsedRemovePathArgs = {
  force: boolean;
  path: string;
  recursive: boolean;
};
type ParsedGetFileInfoArgs = {
  path: string;
};

// 1. Resolve directory listing entry type ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveDirectoryListingEntryType(match: RegExpMatchArray | null): DirectoryListingEntryType {
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
  const resolvedFilePath = parsed.isUrl ? parsed.path : resolveAbsolutePath(parsed.path);

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
        fileName: path.basename(resolvedFilePath),
        filePath: resolvedFilePath,
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
    const fileType = fileResult.metadata?.isDirectory ? ("directory" as const) : resolvePreviewFileType(resolvedFilePath);
    return {
      content: [{ type: "text", text: textContent }],
      structuredContent: {
        fileName: path.basename(resolvedFilePath),
        filePath: resolvedFilePath,
        fileType,
        textContent,
      },
    };
  }
}

// 3. Handle parsed read file with timeout ――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedReadFileWithTimeout(parsed: ParsedReadFileArgs): Promise<ServerResult> {
  const result = await withTimeout(handleParsedReadFile(parsed), READ_FILE_HANDLER_TIMEOUT_MS, "Read file handler operation", null);
  if (result == null) {
    // Handles the impossible case where withTimeout resolves to null instead of throwing
    throw new Error("Failed to read the file");
  }
  return result;
}

// 4. Handle read file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFile(args: unknown): Promise<ServerResult> {
  // Add input validation
  if (args === null || args === undefined) {
    return createErrorResponse("No arguments provided for read_file command");
  }
  const parsed = ReadFileArgsSchema.parse(args);

  return await handleParsedReadFileWithTimeout(parsed);
}

// 3. Resolve write content ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveWriteContent(parsed: ParsedWriteFileArgs): Promise<string> {
  if (parsed.content !== undefined) {
    return parsed.content;
  }
  return readTextSliceInternal(parsed.content_path ?? "", parsed.content_offset, parsed.content_length);
}

// 4. Count write lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countWriteLines(content: string): number {
  return content.split("\n").length;
}

// 5. Build write warning message ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function buildWriteWarningMessage(lineCount: number, warningLineLimit: number): string {
  if (lineCount <= warningLineLimit) {
    return "";
  }
  return `File written successfully! (${lineCount} lines)

Performance tip: For optimal speed, consider chunking files into ≤30 line pieces in future operations.`;
}

// 6. Handle parsed write file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedWriteFile(parsed: ParsedWriteFileArgs, warningLineLimit: number): Promise<ServerResult> {
  const content = await resolveWriteContent(parsed);
  const lineCount = countWriteLines(content);
  const warningMessage = buildWriteWarningMessage(lineCount, warningLineLimit);

  await writeFile(parsed.path, content, parsed.mode);

  const modeMessage = parsed.mode === "append" ? "appended to" : "wrote to";
  const resolvedWritePath = resolveAbsolutePath(parsed.path);

  return {
    content: [
      {
        type: "text",
        text: `Successfully ${modeMessage} ${parsed.path} (${lineCount} lines) ${warningMessage}`,
      },
    ],
    structuredContent: {
      fileName: path.basename(resolvedWritePath),
      filePath: resolvedWritePath,
      fileType: resolvePreviewFileType(resolvedWritePath),
    },
  };
}

// 7. Handle write file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWriteFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = WriteFileArgsSchema.parse(args);
    const config = await configManager.getConfig();
    const warningLineLimit = config.fileWriteLineLimit ?? 50;

    return await handleParsedWriteFile(parsed, warningLineLimit);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 8. Handle parsed create directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedCreateDirectory(parsed: ParsedCreateDirectoryArgs): Promise<ServerResult> {
  await createDirectory(parsed.path);
  return {
    content: [{ type: "text", text: `Successfully created directory ${parsed.path}` }],
  };
}

// 9. Handle create directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCreateDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = CreateDirectoryArgsSchema.parse(args);

    return await handleParsedCreateDirectory(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 10. Handle parsed list directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedListDirectory(parsed: ParsedListDirectoryArgs): Promise<ServerResult> {
  const entries = await listDirectory(parsed.path, parsed.depth, {
    excludePatterns: parsed.excludePatterns,
    includeFiles: parsed.includeFiles,
    maxEntries: parsed.maxEntries,
  });

  const resultText = entries.join("\n");
  const resolvedPath = resolveAbsolutePath(parsed.path);
  const structuredEntries = entries.map((entry) => {
    const match = entry.match(DIRECTORY_LISTING_ENTRY_PATTERN);

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
      entries: structuredEntries,
      listing: resultText,
    },
  };
}

// 11. Handle list directory ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = ListDirectoryArgsSchema.parse(args);

    return await handleParsedListDirectory(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
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
    const parsed = CopyFileArgsSchema.parse(args);

    return await handleParsedCopyFile(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
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
    const parsed = MoveFileArgsSchema.parse(args);

    return await handleParsedMoveFile(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 9. Build rename destination path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function buildRenameDestinationPath(sourcePath: string, newName: string): string {
  const normalizedName = newName.trim();
  const hasPathSeparator = normalizedName.includes("/") || normalizedName.includes("\\");

  if (normalizedName.length === 0) {
    throw new Error("newName must not be empty");
  }
  if (normalizedName === "." || normalizedName === "..") {
    throw new Error("newName must not be . or ..");
  }
  if (hasPathSeparator || path.win32.isAbsolute(normalizedName) || path.posix.isAbsolute(normalizedName) || path.basename(normalizedName) !== normalizedName) {
    throw new Error("newName must be a single path segment");
  }
  return path.join(path.dirname(sourcePath), normalizedName);
}

// 17. Handle parsed rename file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedRenameFile(parsed: ParsedRenameFileArgs): Promise<ServerResult> {
  const destinationPath = buildRenameDestinationPath(parsed.path, parsed.newName);
  await moveFile(parsed.path, destinationPath);
  return {
    content: [{ type: "text", text: `Successfully renamed ${parsed.path} to ${destinationPath}` }],
  };
}

// 18. Handle rename file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRenameFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = RenameFileArgsSchema.parse(args);

    return await handleParsedRenameFile(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 19. Handle parsed remove path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function handleParsedRemovePath(parsed: ParsedRemovePathArgs): Promise<ServerResult> {
  const resolvedPath = resolveAbsolutePath(parsed.path);

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
    const parsed = RemovePathArgsSchema.parse(args);

    return await handleParsedRemovePath(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 12. Format value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatValue(value: unknown, indent: string = ""): string {
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
  const formattedText = Object.entries(info)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join("\n");

  return {
    content: [
      {
        type: "text",
        text: formattedText,
      },
    ],
    structuredContent: info,
  };
}

// 23. Handle get file info ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFileInfo(args: unknown): Promise<ServerResult> {
  try {
    const parsed = GetFileInfoArgsSchema.parse(args);

    return await handleParsedGetFileInfo(parsed);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 14. Handle read files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFiles(args: unknown): Promise<ServerResult> {
  const parsed = ReadFilesArgsSchema.parse(args);
  const items = parsed.items ?? parsed.paths?.map((filePath) => ({ isUrl: false, offset: 0, path: filePath })) ?? [];
  const results = await runParallelBatch(items, (item) => handleParsedReadFileWithTimeout(item));
  const response = createBatchToolResponse("read_files", results);

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
function createWriteFilesBatchResponse(items: BatchToolItemResult<ParsedWriteFileArgs>[]): ServerResult {
  const totalCount = items.length;
  const failedCount = items.filter((item) => !item.ok).length;
  const succeededCount = totalCount - failedCount;
  const summaryLines = items.map((item) => {
    const statusText = item.ok ? "OK" : "ERROR";
    return `- [${item.index}] ${statusText} ${path.basename(item.input.path)}`;
  });

  return {
    content: [
      {
        type: "text",
        text: `write_files: ${succeededCount}/${totalCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ""}\n\n${summaryLines.join("\n")}`,
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
      succeededCount,
      toolName: "write_files",
      totalCount,
    },
  };
}

// 19. Handle write files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWriteFiles(args: unknown): Promise<ServerResult> {
  const parsed = WriteFilesArgsSchema.parse(args);
  const config = await configManager.getConfig();
  const warningLineLimit = config.fileWriteLineLimit ?? 50;
  const results = await runParallelBatch(parsed.items, (item) => handleParsedWriteFile(item, warningLineLimit));

  return createWriteFilesBatchResponse(results);
}

// 16. Handle create directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCreateDirectories(args: unknown): Promise<ServerResult> {
  const parsed = CreateDirectoriesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.paths, (dirPath) => handleParsedCreateDirectory({ path: dirPath }));
  const response = createBatchToolResponse("create_directories", results);

  return response;
}

// 17. Handle list directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListDirectories(args: unknown): Promise<ServerResult> {
  const parsed = ListDirectoriesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleParsedListDirectory(item));
  const response = createBatchToolResponse("list_directories", results);

  return response;
}

// 18. Handle copy files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCopyFiles(args: unknown): Promise<ServerResult> {
  const parsed = CopyFilesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleParsedCopyFile(item));
  const response = createBatchToolResponse("copy_files", results);

  return response;
}

// 19. Handle move files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleMoveFiles(args: unknown): Promise<ServerResult> {
  const parsed = MoveFilesArgsSchema.parse(args);
  const results = await runLimitedParallelBatch(parsed.items, MOVE_FILE_BATCH_CONCURRENCY, (item) => handleParsedMoveFile(item));
  const response = createBatchToolResponse("move_files", results);

  return response;
}

// 20. Handle rename files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRenameFiles(args: unknown): Promise<ServerResult> {
  const parsed = RenameFilesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleParsedRenameFile(item));
  const response = createBatchToolResponse("rename_files", results);

  return response;
}

// 21. Handle remove files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRemoveFiles(args: unknown): Promise<ServerResult> {
  const parsed = RemoveFilesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleParsedRemovePath(item));
  const response = createBatchToolResponse("remove_files", results);

  return response;
}

// 22. Handle get file infos ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFileInfos(args: unknown): Promise<ServerResult> {
  const parsed = GetFileInfosArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.paths, (filePath) => handleParsedGetFileInfo({ path: filePath }));
  const response = createBatchToolResponse("get_file_infos", results);

  return response;
}
