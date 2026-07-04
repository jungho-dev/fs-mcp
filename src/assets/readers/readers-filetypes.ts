/**
 * @file src/assets/readers/readers-filetypes.ts
 * @description Preview file type definitions.
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";

export declare type PreviewFileType = "markdown" | "text" | "html" | "image" | "directory" | "unsupported";

export const MRK_PRV_EXT = new Set([".md", ".markdown", ".mdx"]);
export const HTM_PRV_EXT = new Set([".html", ".htm"]);

export const TXT_PRV_EXT = new Set([".txt", ".text", ".log", ".json", ".yaml", ".yml", ".toml", ".ini", ".xml", ".css", ".scss", ".less", ".js", ".cjs", ".mjs", ".ts", ".jsx", ".tsx", ".sh", ".bash", ".zsh", ".py", ".rb", ".java", ".go", ".rs", ".sql", ".srt", ".vtt"]);

const TXT_PRV_BSN = new Set([".env", ".gitignore", ".gitattributes", "dockerfile", "makefile"]);

// 1. Resolve preview file type --------------------------------------------------------------------
export function resolvePreviewFileType(filePath: string): PreviewFileType {
  const normPth2 = filePath.toLowerCase();
  const extension = path.extname(normPth2);
  const basename = path.basename(normPth2);

  if (MRK_PRV_EXT.has(extension)) {
    return "markdown";
  }
  if (HTM_PRV_EXT.has(extension)) {
    return "html";
  }
  if (TXT_PRV_EXT.has(extension) || TXT_PRV_BSN.has(basename)) {
    return "text";
  }
  return "unsupported";
}
