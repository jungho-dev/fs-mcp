/**
 * @file src/features/search/search-ripgrep-adapter.ts
 * @description Ripgrep search adapter.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {execSync} from "node:child_process";
import {chmodSync, existsSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";

const RIPGREP_PATH_LINE_PATTERN = /\r?\n/;
const WINDOWS_PLATFORM = "win32";
const RIPGREP_NOT_FOUND_MESSAGE = "ripgrep binary not found. fs-mcp requires ripgrep to perform searches. " + "Please install ripgrep:\n" + "  macOS: brew install ripgrep\n" + "  Linux: See https://github.com/BurntSushi/ripgrep#installation\n" + "  Windows: choco install ripgrep or download from https://github.com/BurntSushi/ripgrep/releases";

let cachedRgPath: string | null = null;

// 1. Ripgrep resolution ―――――――――――――――――――――――――――――――――――――――――――
export async function getRipgrepPath(): Promise<string> {
  if (cachedRgPath) {
  	return cachedRgPath;
  }
  const bundledPath = await resolveBundledRipgrepPath();
  if (bundledPath) {
  	return cacheRipgrepPath(bundledPath);
  }
  const systemPath = resolveSystemRipgrepPath();
  if (systemPath) {
  	return cacheRipgrepPath(systemPath);
  }
  const commonPath = resolveCommonRipgrepPath();
  if (commonPath) {
  	return cacheRipgrepPath(commonPath);
  }
  throw new Error(RIPGREP_NOT_FOUND_MESSAGE);
}

// 2. Cache reset ――――――――――――――――――――――――――――――――――――――――――――――――――
export function clearRipgrepCache(): void {
  cachedRgPath = null;
}

// 3. Bundled package lookup ――――――――――――――――――――――――――――――――――――――――
async function resolveBundledRipgrepPath(): Promise<string | null> {
  try {
    const {rgPath} = await import("@vscode/ripgrep");
    if (existsSync(rgPath)) {
    	ensureExecutable(rgPath);
      return rgPath;
    }
  }
  catch (_e) {
    return null;
  }
  return null;
}

// 4. System PATH lookup ―――――――――――――――――――――――――――――――――――――――――――
function resolveSystemRipgrepPath(): string | null {
  try {
    const isWindows = process.platform === WINDOWS_PLATFORM;
    const systemRg = isWindows ? "rg.exe" : "rg";
    const whichCmd = isWindows ? "where" : "which";
    const result = execSync(`${whichCmd} ${systemRg}`, {encoding: "utf-8"}).trim().split(RIPGREP_PATH_LINE_PATTERN)[0];
    if (result && existsSync(result)) {
    	return result;
    }
  }
  catch (_e) {
    return null;
  }
  return null;
}

// 5. Known install path lookup ―――――――――――――――――――――――――――――――――――――
function resolveCommonRipgrepPath(): string | null {
  for (const possiblePath of getCommonRipgrepPaths()) {
    if (existsSync(possiblePath)) {
    	return possiblePath;
    }
  }
  return null;
}

// 6. Common install path list ――――――――――――――――――――――――――――――――――――――
function getCommonRipgrepPaths(): string[] {
  if (process.platform === WINDOWS_PLATFORM) {
  	return ["C:\\Program Files\\Ripgrep\\rg.exe", "C:\\Program Files (x86)\\Ripgrep\\rg.exe", join(homedir(), "scoop", "apps", "ripgrep", "current", "rg.exe"), join(homedir(), ".cargo", "bin", "rg.exe")];
  }
  return ["/usr/local/bin/rg", "/usr/bin/rg", join(homedir(), ".cargo", "bin", "rg"), "/opt/homebrew/bin/rg"];
}

// 7. Executable permission guard ―――――――――――――――――――――――――――――――――――
function ensureExecutable(rgPath: string): void {
  if (process.platform === WINDOWS_PLATFORM) {
  	return;
  }
  try {
    chmodSync(rgPath, 0o755);
  }
  catch (_e) {
    // Ignore chmod errors; packaged binaries may be read-only.
  }
}

// 8. Cache assignment ―――――――――――――――――――――――――――――――――――――――――――――
function cacheRipgrepPath(rgPath: string): string {
  cachedRgPath = rgPath;
  return rgPath;
}
