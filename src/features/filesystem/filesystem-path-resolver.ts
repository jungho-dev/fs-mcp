/**
 * @file src/features/filesystem/filesystem-path-resolver.ts
 * @description Filesystem path resolution helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import os from "node:os";
import path from "node:path";

// 1. Expand home ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function expandHome(filePath: string): string {
  if (filePath === "~" || filePath.startsWith("~/") || filePath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

// 2. Resolve absolute path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function resolveAbsolutePath(filePath: string): string {
  const expanded = expandHome(filePath);
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(process.cwd(), expanded);
}
