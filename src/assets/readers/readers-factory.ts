/**
 * @file src/assets/readers/readers-factory.ts
 * @description Filesystem reader factory.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Factory pattern for creating appropriate file handlers
// Routes file operations to the correct handler based on file type
//
// Each handler implements canHandle() which can be sync (extension-based)
// or async (content-based like BinaryFileHandler using isBinaryFile)

import type {FileHandler} from "@assets/readers/readers-base";
import {BinaryFileHandler} from "@assets/readers/readers-binary";
import {DocxFileHandler} from "@assets/readers/readers-docx";
import {ImageFileHandler} from "@assets/readers/readers-image";
import {TextFileHandler} from "@assets/readers/readers-text";

// Singleton instances of each handler
let imageHandler: ImageFileHandler | null = null;
let textHandler: TextFileHandler | null = null;
let binaryHandler: BinaryFileHandler | null = null;
let docxHandler: DocxFileHandler | null = null;

// 1. Get image handler ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getImageHandler(): ImageFileHandler {
  if (!imageHandler) {
    imageHandler = new ImageFileHandler();
  }
  return imageHandler;
}

// 2. Get text handler ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getTextHandler(): TextFileHandler {
  if (!textHandler) {
    textHandler = new TextFileHandler();
  }
  return textHandler;
}

// 3. Get binary handler ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getBinaryHandler(): BinaryFileHandler {
  if (!binaryHandler) {
    binaryHandler = new BinaryFileHandler();
  }
  return binaryHandler;
}

// 4. Get docx handler ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDocxHandler(): DocxFileHandler {
  if (!docxHandler) {
    docxHandler = new DocxFileHandler();
  }
  return docxHandler;
}

// 2. Get the appropriate file handler for a given file path ―――――――――――――――――――――――――――――――――――――――
// Each handler's canHandle() determines if it can process the file.
// Extension-based handlers (DOCX, Image) return sync boolean.
// BinaryFileHandler uses async isBinaryFile for content-based detection.
// Priority order:
// 1. DOCX files (extension based)
// 2. Image files (png, jpg, gif, webp) - extension based
// 3. Binary files - content-based detection via isBinaryFile
// 4. Text files (default)
// @param filePath File path to get handler for
// @returns FileHandler instance that can handle this file

// 5. Get file handler ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getFileHandler(filePath: string): Promise<FileHandler> {
  // Check DOCX first (extension-based, sync)
  if (getDocxHandler().canHandle(filePath)) {
    return getDocxHandler();
  }
  // Check Image (extension-based, sync - images are binary but handled specially)
  if (getImageHandler().canHandle(filePath)) {
    return getImageHandler();
  }
  // Check Binary (content-based, async via isBinaryFile)
  if (await getBinaryHandler().canHandle(filePath)) {
    return getBinaryHandler();
  }
  // Default to text handler
  return getTextHandler();
}

// 3. Check if a file path is an image file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Delegates to ImageFileHandler.canHandle to avoid duplicating extension logic
// @param path File path
// @returns true if file is an image format

// 6. Is image file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isImageFile(path: string): boolean {
  return getImageHandler().canHandle(path);
}
