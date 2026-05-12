/**
 * @file src/assets/readers/readers-binary.ts
 * @description Binary file reader.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Binary file handler
// Handles binary files that aren't supported by other handlers (Image, DOCX)
// Uses isBinaryFile for content-based detection
// Returns instructions to use start_process with appropriate tools

import fs from "node:fs/promises";
import path from "node:path";
import type { FileHandler, FileInfo, FileResult, ReadOptions } from "@assets/readers/readers-base";
import { isBinaryFile } from "isbinaryfile";

// 1. Binary file handler implementation ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Uses content-based detection via isBinaryFile
// 1. Binary file handler ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export class BinaryFileHandler implements FileHandler {

  // 2. Can handle ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async canHandle(filePath: string): Promise<boolean> {
    // Content-based binary detection using isBinaryFile
    try {
      return await isBinaryFile(filePath);
    }
    catch (_error) {
      // If we can't check (file doesn't exist, etc.), don't handle it
      return false;
    }
  }

  // 3. Read ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async read(filePath: string, _options?: ReadOptions): Promise<FileResult> {
    const instructions = this.getBinaryInstructions(filePath);

    return {
      content: instructions,
      mimeType: "text/plain",
      metadata: {
        isBinary: true,
      },
    };
  }

  // 4. Write ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async write(_path: string, _content: unknown): Promise<void> {
    throw new Error("Cannot write binary files directly. Use start_process with appropriate tools (Python, Node.js libraries, command-line utilities).");
  }

  // 5. Get info ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getInfo(path: string): Promise<FileInfo> {
    const stats = await fs.stat(path);

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8).slice(-3),
      fileType: "binary",
      metadata: {
        isBinary: true,
      },
    };
  }

  // 2. Get binary instructions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getBinaryInstructions(filePath: string): string {
    const fileName = path.basename(filePath);
    return (`
      Cannot read binary file as text: ${fileName}
      Use start_process + interact_with_process to analyze binary files with appropriate tools (Node.js or Python libraries, command-line utilities, etc.).

      The read_file tool only handles text files, images, and DOCX files.
    `).trim();
  }
}
