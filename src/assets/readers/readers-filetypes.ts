/**
 * @file src/assets/readers/readers-filetypes.ts
 * @description Preview file type definitions.
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";

export type PreviewFileType = "markdown" | "text" | "html" | "image" | "directory" | "unsupported";

export const MARKDOWN_PREVIEW_EXTENSIONS = new Set([".md", ".markdown", ".mdx"]);
export const HTML_PREVIEW_EXTENSIONS = new Set([".html", ".htm"]);

export const TEXT_PREVIEW_EXTENSIONS = new Set([".txt", ".text", ".log", ".json", ".yaml", ".yml", ".toml", ".ini", ".xml", ".css", ".scss", ".less", ".js", ".cjs", ".mjs", ".ts", ".jsx", ".tsx", ".sh", ".bash", ".zsh", ".py", ".rb", ".java", ".go", ".rs", ".sql", ".srt", ".vtt"]);

const TEXT_PREVIEW_BASENAMES = new Set([".env", ".gitignore", ".gitattributes", "dockerfile", "makefile"]);

// 1. Resolve preview file type ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function resolvePreviewFileType(filePath: string): PreviewFileType {
  const normalizedPath = filePath.toLowerCase();
  const extension = path.extname(normalizedPath);
  const basename = path.basename(normalizedPath);

  if (MARKDOWN_PREVIEW_EXTENSIONS.has(extension)) {
  	return "markdown";
  }
  if (HTML_PREVIEW_EXTENSIONS.has(extension)) {
  	return "html";
  }
  if (TEXT_PREVIEW_EXTENSIONS.has(extension) || TEXT_PREVIEW_BASENAMES.has(basename)) {
  	return "text";
  }
  return "unsupported";
}
