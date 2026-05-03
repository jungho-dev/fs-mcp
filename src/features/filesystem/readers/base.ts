/**
 * @file src/features/filesystem/readers/base.ts
 * @description Filesystem reader base contracts.
 * @author JUNGHO
 * @since 2026-05-02
 */

/**
 * Base interfaces and types for file handling system
 * All file handlers implement the FileHandler interface
 */

/**
 * Base interface that all file handlers must implement
 */
export interface FileHandler {
  /**
   * Read file content
   * @param path Validated file path
   * @param options Read options
   * @returns File result with content and metadata
   */
  read: (path: string, options?: ReadOptions) => Promise<FileResult>;

  /**
   * Write file (complete rewrite or append)
   * @param path Validated file path
   * @param content Content to write
   * @param mode Write mode: 'rewrite' (default) or 'append'
   */
  write: (path: string, content: unknown, mode?: "rewrite" | "append") => Promise<void>;

  /**
   * Optional handler-specific edit path.
   * DocxFileHandler uses this for XML/text-bearing replacements.
   *
   * @param path Validated file path
   * @param range Handler-specific range identifier
   * @param content New content for the target
   * @param options Additional format-specific options
   * @returns Result with success status
   */
  editRange?: (path: string, range: string, content: unknown, options?: Record<string, unknown>) => Promise<EditResult>;

  /**
   * Get file metadata
   * @param path Validated file path
   * @returns File information including type-specific metadata
   */
  getInfo: (path: string) => Promise<FileInfo>;

  /**
   * Check if this handler can handle the given file
   * @param path File path
   * @returns true if this handler supports this file type (can be async for content-based checks)
   */
  canHandle: (path: string) => boolean | Promise<boolean>;
}
/**
 * Options for reading files
 */
export interface ReadOptions {
  /** Whether the path is a URL */
  isUrl?: boolean;

  /** Starting line number */
  offset?: number;

  /** Maximum number of lines to read */
  length?: number;

  /** Whether to include status messages (default: true) */
  includeStatusMessage?: boolean;
}
/**
 * Result from reading a file
 */
export interface FileResult {
  /** File content (string for text, Buffer for binary, base64 string for images) */
  content: string | Buffer;

  /** MIME type of the content */
  mimeType: string;

  /** Type-specific metadata */
  metadata?: FileMetadata;
}
/**
 * File-type specific metadata
 */
export interface FileMetadata {
  /** For images */
  isImage?: boolean;

  /** For directories (read_file fallback to listDirectory) */
  isDirectory?: boolean;

  /** For binary files */
  isBinary?: boolean;

  /** For text files */
  lineCount?: number;

  /** For DOCX files */
  isDocx?: boolean;
  paragraphCount?: number;
  tableCount?: number;
  imageCount?: number;
  wordCount?: number;

  /** Error information if operation failed */
  error?: boolean;
  errorMessage?: string;
}
/**
 * Result from edit operation (used by editRange)
 */
export interface EditResult {
  /** Whether all edits succeeded */
  success: boolean;

  /** Number of edits successfully applied */
  editsApplied: number;

  /** Errors that occurred during editing */
  errors?: Array<{
    location: string;
    error: string;
  }>;
}
/**
 * File information and metadata
 */
export interface FileInfo {
  /** File size in bytes */
  size: number;

  /** Creation time */
  created: Date;

  /** Last modification time */
  modified: Date;

  /** Last access time */
  accessed: Date;

  /** Is this a directory */
  isDirectory: boolean;

  /** Is this a regular file */
  isFile: boolean;

  /** File permissions (octal string) */
  permissions: string;

  /** File type classification */
  fileType: "text" | "image" | "binary" | "docx";

  /** Type-specific metadata */
  metadata?: FileMetadata;
}
