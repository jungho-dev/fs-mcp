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

const RPLP = /\r?\n/;
const WNDW_PLTF = "win32";
// biome-ignore lint/security/noSecrets: Windows ProgramFiles(x86) environment variable name is not a secret.
const PFXE = "ProgramFiles(x86)";
const RNFM = "ripgrep binary not found. fs-mcp requires ripgrep to perform searches. " + "Please install ripgrep:\n" + "  macOS: brew install ripgrep\n" + "  Linux: See https://github.com/BurntSushi/ripgrep#installation\n" + "  Windows: choco install ripgrep or download from https://github.com/BurntSushi/ripgrep/releases";

let cachedRgPath: string | null = null;

// 1. Get ripgrep path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
  throw new Error(RNFM);
}

// 2. Resolve bundled ripgrep path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 3. Resolve system ripgrep path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveSystemRipgrepPath(): string | null {
  try {
    const isWindows = process.platform === WNDW_PLTF;
    const systemRg = isWindows ? "rg.exe" : "rg";
    const whichCmd = isWindows ? "where" : "which";
    const result = execSync(`${whichCmd} ${systemRg}`, {encoding: "utf-8"}).trim().split(RPLP)[0];
    if (result && existsSync(result)) {
      return result;
    }
  }
  catch (_e) {
    return null;
  }
  return null;
}

// 4. Resolve common ripgrep path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveCommonRipgrepPath(): string | null {
  for (const possiblePath of getCommonRipgrepPaths()) {
    if (existsSync(possiblePath)) {
      return possiblePath;
    }
  }
  return null;
}

// 5. Get common ripgrep paths ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getCommonRipgrepPaths(): string[] {
  if (process.platform === WNDW_PLTF) {
    const commonPaths = [join(homedir(), "scoop", "apps", "ripgrep", "current", "rg.exe"), join(homedir(), ".cargo", "bin", "rg.exe")];
    const programFiles = process.env.ProgramFiles?.trim();
    const prgrFlsX86 = process.env[PFXE]?.trim();

    if (programFiles && programFiles.length > 0) {
      commonPaths.unshift(join(programFiles, "Ripgrep", "rg.exe"));
    }
    if (prgrFlsX86 && prgrFlsX86.length > 0) {
      commonPaths.push(join(prgrFlsX86, "Ripgrep", "rg.exe"));
    }
    return commonPaths;
  }
  return ["/usr/local/bin/rg", "/usr/bin/rg", join(homedir(), ".cargo", "bin", "rg"), "/opt/homebrew/bin/rg"];
}

// 6. Ensure executable ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function ensureExecutable(rgPath: string): void {
  if (process.platform === WNDW_PLTF) {
    return;
  }
  try {
    chmodSync(rgPath, 0o755);
  }
  catch (_e) {
    // Ignore chmod errors; packaged binaries may be read-only.
  }
}

// 7. Cache ripgrep path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function cacheRipgrepPath(rgPath: string): string {
  cachedRgPath = rgPath;
  return rgPath;
}
