/**
 * @file src/assets/readers/readers-base.ts
 * @description Filesystem reader base contracts.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Base interfaces and types for file handling system
// All file handlers implement the FileHandler interface

// 1. Base interface that all file handlers must implement ―――――――――――――――――――――――――――――――――――――――――
export declare interface FileHandler {

  // Check if this handler can handle the given file
  // @param path File path
  // @returns true if this handler supports this file type (can be async for content-based checks)
  canHandle: (path: string) => boolean | Promise<boolean>;

  // Optional handler-specific edit path.
  // DocxFileHandler uses this for XML/text-bearing replacements.
  //
  // @param path Validated file path
  // @param range Handler-specific range identifier
  // @param content New content for the target
  // @param options Additional format-specific options
  // @returns Result with success status
  editRange?: (path: string, range: string, content: unknown, options?: Record<string, unknown>) => Promise<EditResult>;

  // Get file metadata
  // @param path Validated file path
  // @returns File information including type-specific metadata
  getInfo: (path: string) => Promise<FileInfo>;
  // Read file content
  // @param path Validated file path
  // @param options Read options
  // @returns File result with content and metadata
  read: (path: string, options?: ReadOptions) => Promise<FileResult>;

  // Write file (complete rewrite or append)
  // @param path Validated file path
  // @param content Content to write
  // @param mode Write mode: 'rewrite' (default) or 'append'
  write: (path: string, content: unknown, mode?: "rewrite" | "append") => Promise<void>;
}

// 2. Options for reading files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export declare interface ReadOptions {

  // Whether to include status messages (default: true)
  includeStatusMessage?: boolean;
  // Whether the path is a URL
  isUrl?: boolean;

  // Maximum number of lines to read
  length?: number;

  // Starting line number
  offset?: number;
}

// 3. Result from reading a file ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export declare interface FileResult {
  // File content (string for text, Buffer for binary, base64 string for images)
  content: string | Buffer;

  // Type-specific metadata
  metadata?: FileMetadata;

  // MIME type of the content
  mimeType: string;
}

// 4. File-type specific metadata ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export declare interface FileMetadata {

  // Error information if operation failed
  error?: boolean;
  errorMessage?: string;
  imageCount?: number;

  // For binary files
  isBinary?: boolean;

  // For directories (read_file fallback to listDirectory)
  isDirectory?: boolean;

  // For DOCX files
  isDocx?: boolean;
  // For images
  isImage?: boolean;

  // For text files
  lineCount?: number;
  paragraphCount?: number;
  tableCount?: number;
  wordCount?: number;
}

// 5. Result from edit operation (used by editRange) ―――――――――――――――――――――――――――――――――――――――――――――――
export declare interface EditResult {

  // Number of edits successfully applied
  editsApplied: number;

  // Errors that occurred during editing
  errors?: Array<{
    location: string;
    error: string;
  }>;
  // Whether all edits succeeded
  success: boolean;
}

// 6. File information and metadata ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export declare interface FileInfo {

  // Last access time
  accessed: Date;

  // Creation time
  created: Date;

  // File type classification
  fileType: "text" | "image" | "binary" | "docx";

  // Is this a directory
  isDirectory: boolean;

  // Is this a regular file
  isFile: boolean;

  // Type-specific metadata
  metadata?: FileMetadata;

  // Last modification time
  modified: Date;

  // File permissions (octal string)
  permissions: string;
  // File size in bytes
  size: number;
}
