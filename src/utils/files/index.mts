/**
 * File handling system
 * Exports all file handlers, interfaces, and utilities
 */

// Base interfaces and types
export * from './base.mjs';

// Factory function
export { getFileHandler, isImageFile } from './factory.mjs';

// File handlers
export { TextFileHandler } from './text.mjs';
export { ImageFileHandler } from './image.mjs';
export { BinaryFileHandler } from './binary.mjs';
