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
import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { createErrorResponse } from "@cores/responses/responses-error";
import { configManager } from "@features/config/config-store";
import { resolveAbsolutePath } from "@features/filesystem/filesystem-path-resolver";
import { createDirectory, getFileInfo, listDirectory, moveFile, readFile, readMultipleFiles, writeFile } from "@features/filesystem/filesystem-service";
import {
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
  ReadMultipleFilesArgsSchema,
  RenameFileArgsSchema,
  RenameFilesArgsSchema,
  WriteFileArgsSchema,
  WriteFilesArgsSchema,
} from "@schemas/schemas-filesystem";

const DIRECTORY_LISTING_ENTRY_PATTERN = /^(?:\[(F|D|W|X)\]|(□|■))\s*(.*)$/;

// 1. Resolve directory listing entry type ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
// 2. Handle read file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFile(args: unknown): Promise<ServerResult> {
  const HANDLER_TIMEOUT = 60_000; // 60 seconds total operation timeout
  // Add input validation
  if (args === null || args === undefined) {
    return createErrorResponse("No arguments provided for read_file command");
  }
  const readFileOperation = async () => {
    const parsed = ReadFileArgsSchema.parse(args);

    const options: ReadOptions = {
      isUrl: parsed.isUrl,
      offset: parsed.offset ?? 0,
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
    } else {
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
  };

  // Execute with timeout at the handler level
  const result = await withTimeout(readFileOperation(), HANDLER_TIMEOUT, "Read file handler operation", null);
  if (result == null) {
    // Handles the impossible case where withTimeout resolves to null instead of throwing
    throw new Error("Failed to read the file");
  }
  return result;
}
// 3. Handle read multiple files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadMultipleFiles(args: unknown): Promise<ServerResult> {
  const parsed = ReadMultipleFilesArgsSchema.parse(args);
  const fileResults = await readMultipleFiles(parsed.paths);

  // Create a text summary of all files
  const textSummary = fileResults
    .map((result) => {
      if (result.error) {
        return `${result.path}: Error - ${result.error}`;
      } else if (result.mimeType) {
        return `${result.path}: ${result.mimeType} ${result.isImage ? "(image)" : "(text)"}`;
      } else {
        return `${result.path}: Unknown type`;
      }
    })
    .join("\n");

  // Create content items for each file
  const contentItems: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

  // Add the text summary
  contentItems.push({ type: "text", text: textSummary });

  // Add each file content
  for (const result of fileResults) {
    if (!result.error && result.content !== undefined) {
      if (result.isImage && result.mimeType) {
        // For image files, add an image content item
        contentItems.push({
          type: "image",
          data: result.content,
          mimeType: result.mimeType,
        });
      } else {
        // For text files, add a text summary
        contentItems.push({
          type: "text",
          text: `\n--- ${result.path} contents: ---\n${result.content}`,
        });
      }
    }
  }
  return { content: contentItems };
}
// 4. Handle write file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWriteFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = WriteFileArgsSchema.parse(args);

    // Get the large-write warning threshold from configuration
    const config = await configManager.getConfig();
    const warningLineLimit = config.fileWriteLineLimit ?? 50;

    const lines = parsed.content.split("\n");
    const lineCount = lines.length;
    let warningMessage = "";
    if (lineCount > warningLineLimit) {
      warningMessage = `File written successfully! (${lineCount} lines)

Performance tip: For optimal speed, consider chunking files into ≤30 line pieces in future operations.`;
    }
    // Pass the mode parameter to writeFile
    await writeFile(parsed.path, parsed.content, parsed.mode);

    // Provide more informative message based on mode
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}
// 5. Handle create directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCreateDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = CreateDirectoryArgsSchema.parse(args);
    await createDirectory(parsed.path);
    return {
      content: [{ type: "text", text: `Successfully created directory ${parsed.path}` }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}
// 6. Handle list directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = ListDirectoryArgsSchema.parse(args);
    const entries = await listDirectory(parsed.path, parsed.depth);

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}
// 7. Handle move file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleMoveFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = MoveFileArgsSchema.parse(args);
    await moveFile(parsed.source, parsed.destination);
    return {
      content: [{ type: "text", text: `Successfully moved ${parsed.source} to ${parsed.destination}` }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 8. Build rename destination path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 9. Handle rename file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRenameFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = RenameFileArgsSchema.parse(args);
    const destinationPath = buildRenameDestinationPath(parsed.path, parsed.newName);
    await moveFile(parsed.path, destinationPath);
    return {
      content: [{ type: "text", text: `Successfully renamed ${parsed.path} to ${destinationPath}` }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}
// 10. Format value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
// 11. Handle get file info ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFileInfo(args: unknown): Promise<ServerResult> {
  try {
    const parsed = GetFileInfoArgsSchema.parse(args);
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
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return createErrorResponse(errorMessage);
  }
}

// 12. Handle read files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleReadFiles(args: unknown): Promise<ServerResult> {
  const parsed = ReadFilesArgsSchema.parse(args);
  const items = parsed.items ?? parsed.paths?.map((filePath) => ({ path: filePath })) ?? [];
  const results = await runParallelBatch(items, (item) => handleReadFile(item));
  const response = createBatchToolResponse("read_files", results);

  return response;
}

// 13. Handle write files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWriteFiles(args: unknown): Promise<ServerResult> {
  const parsed = WriteFilesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleWriteFile(item));
  const response = createBatchToolResponse("write_files", results);

  return response;
}

// 14. Handle create directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleCreateDirectories(args: unknown): Promise<ServerResult> {
  const parsed = CreateDirectoriesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.paths, (dirPath) => handleCreateDirectory({ path: dirPath }));
  const response = createBatchToolResponse("create_directories", results);

  return response;
}

// 15. Handle list directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleListDirectories(args: unknown): Promise<ServerResult> {
  const parsed = ListDirectoriesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleListDirectory(item));
  const response = createBatchToolResponse("list_directories", results);

  return response;
}

// 16. Handle move files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleMoveFiles(args: unknown): Promise<ServerResult> {
  const parsed = MoveFilesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleMoveFile(item));
  const response = createBatchToolResponse("move_files", results);

  return response;
}

// 17. Handle rename files ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleRenameFiles(args: unknown): Promise<ServerResult> {
  const parsed = RenameFilesArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleRenameFile(item));
  const response = createBatchToolResponse("rename_files", results);

  return response;
}

// 18. Handle get file infos ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGetFileInfos(args: unknown): Promise<ServerResult> {
  const parsed = GetFileInfosArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.paths, (filePath) => handleGetFileInfo({ path: filePath }));
  const response = createBatchToolResponse("get_file_infos", results);

  return response;
}
