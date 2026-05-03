/**
 * @file src/features/config/config-paths.ts
 * @description Configuration path helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";
import process from "node:process";

const DEFAULT_CONFIG_DIR = "C:/Users/jungh/.codex/mcp/fs-mcp";

function resolveTestConfigDir(): string | null {
  const entryPath = process.argv[1];

  if (!entryPath) {
    return null;
  }

  const resolvedEntryPath = path.resolve(process.cwd(), entryPath);
  const normalizedEntryPath = resolvedEntryPath.replaceAll("\\", "/").toLowerCase();

  if (!normalizedEntryPath.includes("/tests/")) {
    return null;
  }

  const testName = path.basename(resolvedEntryPath, path.extname(resolvedEntryPath)).replace(/[^a-z0-9_-]+/gi, "-");
  return path.join(path.dirname(resolvedEntryPath), ".tmp", "config", testName);
}

function resolveConfigDir(): string {
  const configuredDir = process.env.FS_MCP_CONFIG_DIR?.trim();

  if (configuredDir && configuredDir.length > 0) {
    return path.resolve(configuredDir);
  }

  const testConfigDir = resolveTestConfigDir();

  if (testConfigDir) {
    return testConfigDir;
  }

  return DEFAULT_CONFIG_DIR;
}

const CONFIG_DIR = resolveConfigDir();

// Paths relative to the config directory
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.toml");
export const LEGACY_CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const DEFAULT_COMMAND_TIMEOUT = 1000; // milliseconds
