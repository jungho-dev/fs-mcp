/**
 * @file src/features/edit/edit-line-ending-policy.ts
 * @description Line ending policy helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

// 1. Line ending types ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export type LineEndingStyle = "\r\n" | "\n" | "\r";

// 1. Detect line ending ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function detectLineEnding(content: string): LineEndingStyle {
  let index = 0;
  while (index < content.length) {
    if (content[index] === "\r") {
      if (index + 1 < content.length && content[index + 1] === "\n") {
        return "\r\n";
      }
      return "\r";
    }
    if (content[index] === "\n") {
      return "\n";
    }
    index++;
  }
  // Default to system line ending if no line endings found
  return process.platform === "win32" ? "\r\n" : "\n";
}

// 2. Normalize line endings ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function normalizeLineEndings(text: string, targetLineEnding: LineEndingStyle): string {
  // First normalize to LF
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Then convert to target
  if (targetLineEnding === "\r\n") {
    return normalized.replace(/\n/g, "\r\n");
  }
  else if (targetLineEnding === "\r") {
    return normalized.replace(/\n/g, "\r");
  }
  return normalized;
}
