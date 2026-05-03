/**
 * @file src/features/filesystem/readers/reader-exports.ts
 * @description Filesystem reader exports.
 * @author JUNGHO
 * @since 2026-05-02
 */

/**
 * File handling system
 * Exports all file handlers, interfaces, and utilities
 */

// Base interfaces and types
export * from "@features/filesystem/readers/base";
export {BinaryFileHandler} from "@features/filesystem/readers/binary-reader";
export {ImageFileHandler} from "@features/filesystem/readers/image-reader";
// Factory function
export {getFileHandler, isImageFile} from "@features/filesystem/readers/reader-factory";
// File handlers
export {TextFileHandler} from "@features/filesystem/readers/text-reader";
