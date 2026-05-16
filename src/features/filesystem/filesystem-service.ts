/**
 * @file src/features/filesystem/filesystem-service.ts
 * @description Filesystem service operations.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { Dirent, Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileInfo, FileResult, ReadOptions } from "@assets/readers/readers-base";
import { getFileHandler as gtFlHdl } from "@assets/readers/readers-factory";
import { resolvePreviewFileType as rslPrFlTy } from "@assets/readers/readers-filetypes";
import { TextFileHandler as TxtFlHdl } from "@assets/readers/readers-text";
import { withTimeout } from "@assets/utils/utils-timeout";
import { cfgMgr } from "@features/config/config-store";
import { FL_OP_TMTS } from "@features/filesystem/filesystem-limits";

const DIR_WLD_SFF = `${path.sep}*`;
const GREP = /[.+^${}()|[\]\\]/g;
const GLB_ASTR_PAT = /\*/g;
const VPDCMS = 4096;
const TXT_FL_TYPS = new Set(["html", "markdown", "text"]);
const TXT_FL_HDL = new TxtFlHdl();
const vldPrDiCc = new Set<string>();

type LegacyFileInfo = {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
  fileType: FileInfo["fileType"];
  lineCount?: number;
  lastLine?: number;
  appendPosition?: number;
  isImage?: boolean;
  isBinary?: boolean;
};

export interface ListDirectoryOptions {
  excludePatterns?: string[];
  includeFiles?: boolean;
  maxEntries?: number;
}

// 1. Build glob pattern reg exp ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function buildGlobPatternRegExp(pattern: string): RegExp {
  const regexPattern = pattern.replace(GREP, "\\$&").replace(GLB_ASTR_PAT, ".*");
  return new RegExp(`^${regexPattern}$`, "i");
}

// UTILITY FUNCTIONS - Eliminate duplication

// 1. Get MIME type information for a file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param filePath Path to the file
// @returns Object with mimeType and isImage properties

// 1. Get MIME type info ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getMimeTypeInfo(filePath: string): Promise<{ mimeType: string; isImage: boolean }> {
  const { getMimeType, isImageFile } = await import("@features/filesystem/filesystem-mime-registry");
  const mimeType = getMimeType(filePath);
  const isImage = isImageFile(mimeType);
  return { mimeType, isImage };
}

// 4. Permission error message builder ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// or timeout error.
// Lists all common causes without path-based detection — the AI receiving this
// error should inspect the path and inform the user which cause is most likely
// (e.g. cloud storage folder, network drive, system file, locked file, etc.)

// 4. Build permission error ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function buildPermissionError(filePath: string, errCode: string | undefined): Error {
  const isMac = process.platform === "darwin";
  const isTimeout = errCode === "ETIMEDOUT";

  const lines = [
    `Cannot read file — ${isTimeout ? "operation timed out" : "permission denied"} (${errCode}).`,
    `Path: ${filePath}`,
    ``,
    `Based on the path above, determine which cause is most likely and explain it to the user.`,
    ``,
    `Possible causes and fixes:`,
    `  1. File is in cloud storage (Google Drive / iCloud / Dropbox / OneDrive) but not downloaded locally.`,
    `       → Right-click the file and choose "Download Now", "Make Available Offline", or "Keep on This Device".`,
    `  2. Cloud storage app is not running or not signed in.`,
    `       → Open your cloud storage app and make sure it is syncing.`,
    `  3. File is on a network drive or virtual filesystem that is currently unavailable.`,
    `       → Check that the network share or drive is mounted and accessible.`,
    `  4. File has restricted permissions (e.g. system file, locked by another process, or chmod 000).`,
    `       → Check file permissions or close any app that may have the file open.`,
    `  5. The app does not have permission to access this location (macOS Full Disk Access).`,
  ];

  if (isMac) {
  	lines.push(`       → Go to System Settings → Privacy & Security → Full Disk Access and enable Claude.`);
    lines.push(`       → To open that pane directly, run in terminal:`);
    lines.push(`           open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"`);
    lines.push(`         Then find "Claude" in the list and enable the toggle next to it.`);
  }
  else {
  	lines.push(`       → Check that the app has permission to access this file location.`);
  }
  return new Error(lines.join("\n"));
}

// Initialize allowed directories from configuration

// 5. Get allowed dirs ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getAllowedDirs(): Promise<string[]> {
  try {
    const config = await cfgMgr.getConfig();
    if (config.allowedDirectories && Array.isArray(config.allowedDirectories)) {
    	return config.allowedDirectories;
    }
  }
  catch (error) {
    console.error("Failed to initialize allowed directories:", error);
    // Keep the default permissive path
  }
  return [];
}

// Normalize all paths consistently

// 6. Normalize path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizePath(p: string): string {
  return path.normalize(expandHome(p)).toLowerCase();
}

// 7. Expand home ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
  	return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// 7-1. Resolve requested path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveRequestedPath(rqstPth: string): string {
  const expandedPath = expandHome(rqstPth);

  return path.isAbsolute(expandedPath) ? path.resolve(expandedPath) : path.resolve(process.cwd(), expandedPath);
}

// 5. Recursively validates parent directories until it finds a valid one ――――――――――――――――――――――――――
// This function handles the case where we need to create nested directories
// and we need to check if any of the parent directories exist
// @param directoryPath The path to validate
// @returns Promise<boolean> True if a valid parent directory was found

// 8. Validate parent directories ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function validateParentDirectories(dirPth2: string): Promise<boolean> {
  const parentDir = path.dirname(dirPth2);

  // Base case: we've reached the root or the same directory (shouldn't happen normally)
  if (parentDir === dirPth2 || parentDir === path.dirname(parentDir)) {
  	return false;
  }
  if (vldPrDiCc.has(parentDir)) {
  	return true;
  }
  try {
    // Check if the parent directory exists
    const rlPrntDr = await fs.realpath(parentDir);
    vldPrDiCc.add(parentDir);
    vldPrDiCc.add(rlPrntDr);
    if (vldPrDiCc.size > VPDCMS) {
    	vldPrDiCc.clear();
    }
    return true;
  }
  catch {
    // Parent doesn't exist, recursively check its parent
    return validateParentDirectories(parentDir);
  }
}

// 6. Checks if a path is within any of the allowed directories ――――――――――――――――――――――――――――――――――――
// @param pathToCheck Path to check
// @returns boolean True if path is allowed

// 9. Is path allowed ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function isPathAllowed(pathToCheck: string): Promise<boolean> {
  // If root directory is allowed, all paths are allowed
  const allwDrct = await getAllowedDirs();
  if (allwDrct.includes("/") || allwDrct.length === 0) {
  	return true;
  }
  let normPthTChck = normalizePath(pathToCheck);
  if (normPthTChck.slice(-1) === path.sep) {
  	normPthTChck = normPthTChck.slice(0, -1);
  }
  // Check if the path is within any allowed directory
  const isAllowed = allwDrct.some((allowedDir) => {
    let normAllwDr = normalizePath(allowedDir);
    if (normAllwDr.endsWith(DIR_WLD_SFF)) {
    	normAllwDr = normAllwDr.slice(0, -1);
    }
    if (normAllwDr.slice(-1) === path.sep) {
    	normAllwDr = normAllwDr.slice(0, -1);
    }
    // Check if path is exactly the allowed directory
    if (normPthTChck === normAllwDr) {
    	return true;
    }
    // Check if path is a subdirectory of the allowed directory
    // Make sure to add a separator to prevent partial directory name matches
    // e.g. /home/user vs /home/username
    const subdirCheck = normPthTChck.startsWith(normAllwDr + path.sep);
    if (subdirCheck) {
    	return true;
    }
    // If allowed directory is the drive root on Windows, allow access to the entire drive
    if (normAllwDr === "c:" && process.platform === "win32") {
    	return normPthTChck.startsWith("c:");
    }
    return false;
  });

  return isAllowed;
}

// 9-1. Assert allowed path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function assertAllowedPath(pathToCheck: string, rqstPth: string): Promise<void> {
  if (!(await isPathAllowed(pathToCheck))) {
    throw new Error(`Path not allowed: ${rqstPth}. Must be within one of these directories: ${(await getAllowedDirs()).join(", ")}`);
  }
}

// 7. Validates a path to ensure it can be accessed or created ―――――――――――――――――――――――――――――――――――――
// For existing paths, returns the real path (resolving symlinks).
// For non-existent paths, validates parent directories to ensure they exist.
// @param requestedPath The path to validate
// @returns Promise<string> The validated path
// @throws Error if the path or its parent directories don't exist or if the path is not allowed

// 10. Validate path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function validatePath(rqstPth: string): Promise<string> {
  const valOp = async (): Promise<string> => {
    const abslOrig = resolveRequestedPath(rqstPth);

    // Attempt to resolve symlinks to get the real path
    // This will succeed if the path exists and all symlinks in the chain are valid
    // It will fail with ENOENT if:
    //   - The path itself doesn't exist, OR
    //   - A symlink exists but points to a non-existent target (broken symlink)
    let rslvRlPth: string | null = null;
    try {
      rslvRlPth = await fs.realpath(abslOrig, { encoding: "utf8" });
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Only throw for non-ENOENT errors (e.g., permission denied, I/O errors)
      if (!err.code || err.code !== "ENOENT") {
        throw new Error(`Failed to resolve symlink for path: ${abslOrig}. Error: ${err.message}`);
      }
    }
    const pthFrNxtChck = rslvRlPth ?? abslOrig;

    // Check if path is allowed
    await assertAllowedPath(pthFrNxtChck, rqstPth);
    // Check if path exists
    try {
      // fs.stat() will automatically follow symlinks, so we get existence info
      await fs.stat(abslOrig);
      // If path exists, resolve any symlinks
      if (rslvRlPth) {
      	return rslvRlPth;
      }
      return abslOrig;
    }
    catch (_error) {
      // Path doesn't exist - validate parent directories
      if (await validateParentDirectories(abslOrig)) {
      	// Return the path if a valid parent exists
        // This will be used for folder creation and many other file operations
        return abslOrig;
      }
      // If no valid parent found, return the absolute path anyway
      return abslOrig;
    }
  };

  // Execute with timeout
  const result = await withTimeout(valOp(), FL_OP_TMTS.PATH_VALIDATION, `Path validation operation`, null);

  if (result === null) {
    // Keep original path in error for AI while using a generic operation name.

    throw new Error(`Path validation failed for path: ${rqstPth}`);
  }
  return result;
}

// 10-1. Validate target path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function validateTargetPath(rqstPth: string): Promise<string> {
  const valOp = async (): Promise<string> => {
    const abslOrig = resolveRequestedPath(rqstPth);

    try {
      await fs.lstat(abslOrig);
      return validatePath(rqstPth);
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (!err.code || err.code !== "ENOENT") {
        throw new Error(`Failed to inspect target path: ${abslOrig}. Error: ${err.message}`);
      }
    }
    await assertAllowedPath(abslOrig, rqstPth);
    await validateParentDirectories(abslOrig);
    return abslOrig;
  };

  const result = await withTimeout(valOp(), FL_OP_TMTS.PATH_VALIDATION, `Target path validation operation`, null);

  if (result === null) {
    throw new Error(`Target path validation failed for path: ${rqstPth}`);
  }
  return result;
}

// Re-export FileResult from base for consumers
export type { FileResult } from "@assets/readers/readers-base";

// 8. Read file content from a URL ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// @param url URL to fetch content from
// @returns File content or file result with metadata

// 11. Read file from URL ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function readFileFromUrl(url: string): Promise<FileResult> {
  // Import the MIME type utilities
  const { isImageFile } = await import("@features/filesystem/filesystem-mime-registry");

  // Set up fetch with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FL_OP_TMTS.URL_FETCH);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    // Clear the timeout since fetch completed
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    // Get MIME type from Content-Type header or infer from URL
    const contentType = response.headers.get("content-type") || "text/plain";
    const isImage = isImageFile(contentType);
    const isText = contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("xml") || contentType.includes("javascript");

    if (isImage) {
      // For images, convert to base64
      const buffer = await response.arrayBuffer();
      const content = Buffer.from(buffer).toString("base64");

      return { content, mimeType: contentType, metadata: { isImage } };
    }
    else if (isText) {
      // For text content
      const content = await response.text();

      return { content, mimeType: contentType, metadata: { isImage } };
    }
    return {
      content: `Cannot read remote binary content as text: ${url}\n\nUse start_process with appropriate tools to process this URL.`,
      mimeType: "text/plain",
      metadata: { isImage: false, isBinary: true },
    };
  }
  catch (error) {
    // Clear the timeout to prevent memory leaks
    clearTimeout(timeoutId);

    // Return error information instead of throwing
    const errorMessage = error instanceof DOMException && error.name === "AbortError" ? `URL fetch timed out after ${FL_OP_TMTS.URL_FETCH}ms: ${url}` : `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`;

    throw new Error(errorMessage);
  }
}

// 9. Read file content from the local filesystem ――――――――――――――――――――――――――――――――――――――――――――――――――
// @param filePath Path to the file
// @param options Read options
// @returns File content or file result with metadata

// 12. Read file from disk ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function readFileFromDisk(filePath: string, options?: ReadOptions): Promise<FileResult> {
  const { offset = 0 } = options ?? {};
  const { length } = options ?? {};

  // Add validation for required parameters
  if (!filePath || typeof filePath !== "string") {
  	throw new Error("Invalid file path provided");
  }
  const validPath = await validatePath(filePath);

  // Check if path is a directory — return listing instead of EISDIR error
  try {
    const stats = await fs.stat(validPath);
    if (stats.isDirectory()) {
      const dirListOp = async () => {
        const entries = await listDirectory(validPath);
        const listing = entries.join("\n");
        return {
          content: `This is a directory, not a file. Use the list_directory tool instead of read_file for directories.\n\n${listing}`,
          mimeType: "text/plain",
          metadata: { isImage: false, isDirectory: true },
        } as FileResult;
      };
      const dirResult = await withTimeout(dirListOp(), FL_OP_TMTS.FILE_READ, "Directory listing fallback", null);
      if (dirResult === null) {
        throw new Error(`Directory listing timed out for: ${filePath}`);
      }
      return dirResult;
    }
  }
  catch (error) {
    // If stat itself failed, fall through to the read path which will produce a proper error.
    // But if this was a directory-listing error, re-throw — don't let it fall into the file-read path.
    const err = error as NodeJS.ErrnoException;
    if (err.message?.includes("Directory listing") || err.message?.includes("list_directory")) {
    	throw error;
    }
    // stat() failed (e.g. ENOENT) — fall through to the read path below
  }
  // Use withTimeout to handle potential hangs
  const rdOp = async () => {
    // Get appropriate handler for this file type (async - includes binary detection)
    const handler = shouldUseTextFileFastPath(validPath) ? TXT_FL_HDL : await gtFlHdl(validPath);

    // Use handler to read the file
    const result = await handler.read(validPath, {
      offset,
      length,
      includeStatusMessage: true,
    });

    // Return with content as string
    // For images: content is already base64-encoded string from handler
    // For text: content may be string or Buffer, convert to UTF-8 string
    let content: string;
    if (typeof result.content === "string") {
    	content = result.content;
    }
    else if (result.metadata?.isImage) {
    	// Image buffer should be base64 encoded, not UTF-8 converted
      content = result.content.toString("base64");
    }
    else {
    	content = result.content.toString("utf8");
    }
    return {
      content,
      mimeType: result.mimeType,
      metadata: result.metadata,
    };
  };

  // Execute with timeout
  let result: FileResult | null;
  try {
    result = await withTimeout(rdOp(), FL_OP_TMTS.FILE_READ, `Read file operation for ${filePath}`, null);
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException;
    // withTimeout rejects with a plain string "__ERROR__: ... timed out after N seconds"
    // when defaultValue is null — it has no .code property, so check for that too.
    const isWthTmtStr = typeof error === "string" && (error as string).startsWith("__ERROR__:");
    if (isWthTmtStr || err.code === "EPERM" || err.code === "EACCES" || err.code === "ETIMEDOUT") {
    	throw buildPermissionError(filePath, isWthTmtStr ? "ETIMEDOUT" : err.code);
    }
    throw error;
  }
  if (result == null) {
  	// Handles the impossible case where withTimeout resolves to null instead of throwing
    throw new Error("Failed to read the file");
  }
  return result;
}

// 10. Read a file from either the local filesystem or a URL ―――――――――――――――――――――――――――――――――――――――
// @param filePath Path to the file or URL
// @param options Read options
// @returns File content or file result with metadata

// 13. Read file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function readFile(filePath: string, options?: ReadOptions): Promise<FileResult> {
  const { isUrl, offset, length } = options ?? {};
  return isUrl ? readFileFromUrl(filePath) : readFileFromDisk(filePath, { offset, length });
}

// 11. Read file content without status messages for internal operations ―――――――――――――――――――――――――――
// This function preserves exact file content including original line endings,
// which is essential for edit operations that need to maintain file formatting.
// @param filePath Path to the file
// @param offset Starting line number to read from (default: 0)
// @param length Maximum number of lines to read. Omit to read through EOF.
// @returns File content without status headers, with preserved line endings

// 14. Read file internal ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function readFileInternal(filePath: string, offset: number=0, length?: number): Promise<string> {
  const validPath = await validatePath(filePath);

  // Get MIME type
  const { isImage } = await getMimeTypeInfo(validPath);

  if (isImage) {
  	throw new Error("Cannot read image files as text for internal operations");
  }
  // IMPORTANT: For internal operations (especially edit operations), we must
  // preserve exact file content including original line endings.
  // We cannot use readline-based reading as it strips line endings.

  // Read entire file content preserving line endings
  const content = await fs.readFile(validPath, "utf8");

  // If we need to apply offset/length, do it while preserving line endings
  if (offset === 0 && (length === undefined || length >= Number.MAX_SAFE_INTEGER)) {
  	// Most common case for edit operations: read entire file
    return content;
  }
  // Handle offset/length by splitting on line boundaries while preserving line endings
  const lines = TxtFlHdl.splitLinesPreservingEndings(content);

  // Apply offset and length
  const selLns = length === undefined ? lines.slice(offset) : lines.slice(offset, offset + length);

  // Join back together (this preserves the original line endings)
  return selLns.join("");
}

// 15. Read text slice internal ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function readTextSliceInternal(filePath: string, offset: number=0, length?: number): Promise<string> {
  if (!Number.isInteger(offset) || offset < 0) {
  	throw new Error("Text slice offset must be a non-negative integer");
  }
  if (length !== undefined && (!Number.isInteger(length) || length < 0)) {
  	throw new Error("Text slice length must be a non-negative integer");
  }
  const validPath = await validatePath(filePath);

  const { isImage } = await getMimeTypeInfo(validPath);

  if (isImage) {
  	throw new Error("Cannot read image files as text for internal operations");
  }
  const content = await fs.readFile(validPath, "utf8");
  if (length === undefined) {
  	return content.slice(offset);
  }
  return content.slice(offset, offset + length);
}

// 16. Should use text file fast path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function shouldUseTextFileFastPath(filePath: string): boolean {
  return TXT_FL_TYPS.has(rslPrFlTy(filePath));
}

// 17. Write file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function writeFile(filePath: string, content: string, mode: "rewrite" | "append" = "rewrite"): Promise<void> {
  const validPath = await validateTargetPath(filePath);

  if (shouldUseTextFileFastPath(validPath)) {
  	await TXT_FL_HDL.write(validPath, content, mode);
    return;
  }
  // Get appropriate handler for binary and format-specific writes.
  const handler = await gtFlHdl(validPath);

  await handler.write(validPath, content, mode);
}

// 18. Create directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function createDirectory(dirPath: string): Promise<void> {
  const validPath = await validateTargetPath(dirPath);
  await fs.mkdir(validPath, { recursive: true });
}

// 18. List directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function listDirectory(dirPath: string, depth: number=2, options: ListDirectoryOptions={}): Promise<string[]> {
  const validPath = await validatePath(dirPath);
  const results: string[] = [];

  const MX_NSTD_ITMS = 100; // Maximum items to show per nested directory
  const maxEntries = options.maxEntries;
  const exclPats2 = options.excludePatterns?.map((pattern) => buildGlobPatternRegExp(pattern)) ?? [];
  const includeFiles = options.includeFiles !== false;

  // 19. Should skip directory entry ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  function shouldSkipEntry(entry: Dirent, displayPath: string): boolean {
    if (!includeFiles && !entry.isDirectory()) {
    	return true;
    }
    return exclPats2.some((pattern) => pattern.test(entry.name) || pattern.test(displayPath));
  }
  // 19. List recursive ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async function listRecursive(currentPath: string, currentDepth: number, relativePath: string="", isTopLevel: boolean=true): Promise<void> {
    if (currentDepth <= 0) {
    	return;
    }
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException;
      const displayPath = relativePath || path.basename(currentPath);
      // Keep a denied prefix so UI parser regex still matches.
      // Append a hint for permission/timeout errors so user gets context.
      if (err.code === "EPERM" || err.code === "EACCES" || err.code === "ETIMEDOUT") {
        results.push(`${displayPath} — not accessible (permission denied, cloud-only file, or Full Disk Access not granted)`);
      }
      else {
        results.push(`${displayPath}`);
      }
      return;
    }
    // Apply filtering for nested directories (not top level)
    const totalEntries = entries.length;
    const visEntr = entries.filter((entry) => {
      const displayPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      return !shouldSkipEntry(entry, displayPath);
    });
    let entrTShw = visEntr;
    let fltrCnt = 0;
    const itemLimit = isTopLevel ? maxEntries : (maxEntries ?? MX_NSTD_ITMS);

    if (itemLimit !== undefined && visEntr.length > itemLimit) {
    	entrTShw = visEntr.slice(0, itemLimit);
      fltrCnt = visEntr.length - itemLimit;
    }
    for (const entry of entrTShw) {
      const fullPath = path.join(currentPath, entry.name);
      const displayPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

      // Add this entry to results
      results.push(`${displayPath}`);

      // If it's a directory and we have depth remaining, recurse
      if (entry.isDirectory() && currentDepth > 1) {
        try {
          // Validate the path before recursing
          // biome-ignore lint/performance/noAwaitInLoops: Directory traversal preserves order and handles per-entry access failures.
          await validatePath(fullPath);
          await listRecursive(fullPath, currentDepth - 1, displayPath, false);
        }
        catch (_error) {
          // Ignore inaccessible nested directories.
        }
      }
    }
    // Add warning message if items were filtered
    if (fltrCnt > 0) {
      const displayPath = relativePath || path.basename(currentPath);
      results.push(`${displayPath}: ${fltrCnt} items hidden (showing first ${itemLimit} of ${visEntr.length} visible, ${totalEntries} total)`);
    }
  }
  await listRecursive(validPath, depth, "", true);
  return results;
}

// 20. Copy file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function copyFile(sourcePath: string, dstPth: string, recursive: boolean=false, force: boolean=false): Promise<void> {
  const vldSrcPth = await validatePath(sourcePath);
  const vldDstPth = await validateTargetPath(dstPth);
  await fs.cp(vldSrcPth, vldDstPth, {
    errorOnExist: !force,
    force,
    recursive,
  });
}

// 21. Move file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function moveFile(sourcePath: string, dstPth: string): Promise<void> {
  const vldSrcPth = await validatePath(sourcePath);
  const vldDstPth = await validateTargetPath(dstPth);
  await fs.rename(vldSrcPth, vldDstPth);
}

// 22. Remove path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function removePath(filePath: string, recursive: boolean=false, force: boolean=false): Promise<void> {
  const validPath = await validatePath(filePath);
  let stats: Stats;

  try {
    stats = await fs.lstat(validPath);
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (force && err.code === "ENOENT") {
      await fs.rm(validPath, { force, recursive });
      return;
    }
    throw error;
  }
  const isDirectory = stats.isDirectory();

  if (isDirectory && !recursive) {
  	await fs.rmdir(validPath);
    return;
  }
  await fs.rm(validPath, { force, recursive });
}

// 23. Get file info ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getFileInfo(filePath: string): Promise<LegacyFileInfo> {
  const validPath = await validatePath(filePath);

  // Get appropriate handler for this file type (async - includes binary detection)
  const handler = shouldUseTextFileFastPath(validPath) ? TXT_FL_HDL : await gtFlHdl(validPath);

  // Use handler to get file info, with fallback
  let fileInfo: FileInfo;
  try {
    fileInfo = await handler.getInfo(validPath);
  }
  catch (_error) {
    // If handler fails, use fallback stats
    const stats = await fs.stat(validPath);
    fileInfo = {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8).slice(-3),
      fileType: "text" as const,
      metadata: undefined,
    };
  }
  // Convert to legacy format (for backward compatibility)
  const info: LegacyFileInfo = {
    size: fileInfo.size,
    created: fileInfo.created,
    modified: fileInfo.modified,
    accessed: fileInfo.accessed,
    isDirectory: fileInfo.isDirectory,
    isFile: fileInfo.isFile,
    permissions: fileInfo.permissions,
    fileType: fileInfo.fileType,
  };

  // Add type-specific metadata from file handler
  if (fileInfo.metadata) {
    // For text files
    if (fileInfo.metadata.lineCount !== undefined) {
    	info.lineCount = fileInfo.metadata.lineCount;
      info.lastLine = fileInfo.metadata.lineCount - 1;
      info.appendPosition = fileInfo.metadata.lineCount;
    }
    // For images
    if (fileInfo.metadata.isImage) {
    	info.isImage = true;
    }
    // For binary files
    if (fileInfo.metadata.isBinary) {
    	info.isBinary = true;
    }
  }
  return info;
}
