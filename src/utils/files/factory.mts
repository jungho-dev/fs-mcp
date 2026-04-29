/**
 * Factory pattern for creating appropriate file handlers
 * Routes file operations to the correct handler based on file type
 *
 * Each handler implements canHandle() which can be sync (extension-based)
 * or async (content-based like BinaryFileHandler using isBinaryFile)
 */

import type { FileHandler } from './base.mjs';
import { TextFileHandler } from './text.mjs';
import { ImageFileHandler } from './image.mjs';
import { BinaryFileHandler } from './binary.mjs';
import { DocxFileHandler } from './docx.mjs';

// Singleton instances of each handler
let imageHandler: ImageFileHandler | null = null;
let textHandler: TextFileHandler | null = null;
let binaryHandler: BinaryFileHandler | null = null;
let docxHandler: DocxFileHandler | null = null;

/**
 * Initialize handlers (lazy initialization)
 */
function getImageHandler(): ImageFileHandler {
    if (!imageHandler) imageHandler = new ImageFileHandler();
    return imageHandler;
}

function getTextHandler(): TextFileHandler {
    if (!textHandler) textHandler = new TextFileHandler();
    return textHandler;
}

function getBinaryHandler(): BinaryFileHandler {
    if (!binaryHandler) binaryHandler = new BinaryFileHandler();
    return binaryHandler;
}

function getDocxHandler(): DocxFileHandler {
    if (!docxHandler) docxHandler = new DocxFileHandler();
    return docxHandler;
}

/**
 * Get the appropriate file handler for a given file path
 *
 * Each handler's canHandle() determines if it can process the file.
 * Extension-based handlers (DOCX, Image) return sync boolean.
 * BinaryFileHandler uses async isBinaryFile for content-based detection.
 *
 * Priority order:
 * 1. DOCX files (extension based)
 * 2. Image files (png, jpg, gif, webp) - extension based
 * 3. Binary files - content-based detection via isBinaryFile
 * 4. Text files (default)
 *
 * @param filePath File path to get handler for
 * @returns FileHandler instance that can handle this file
 */
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

/**
 * Check if a file path is an image file
 * Delegates to ImageFileHandler.canHandle to avoid duplicating extension logic
 * @param path File path
 * @returns true if file is an image format
 */
export function isImageFile(path: string): boolean {
    return getImageHandler().canHandle(path);
}
