import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CONFIG_FILE, LEGACY_CONFIG_FILE } from "../../../out/features/config/config-paths.js";
import { configManager } from "../../../out/features/config/config-store.js";
import { validatePath } from "../../../out/features/filesystem/filesystem-service.js";

const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-config-toml-preferred");
const BLOCKED_DIR = path.join(os.tmpdir(), "fs-mcp-config-toml-blocked");

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeOptionalFile(filePath, content) {
  if (content === null) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await fs.writeFile(filePath, content, "utf8");
}

async function main() {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.mkdir(BLOCKED_DIR, { recursive: true });

  const originalToml = await readOptionalFile(CONFIG_FILE);
  const originalJson = await readOptionalFile(LEGACY_CONFIG_FILE);

  try {
    await fs.writeFile(
      CONFIG_FILE,
      [
        "blockedCommands = []",
        "defaultShell = " + JSON.stringify(process.platform === "win32" ? "pwsh.exe" : "/bin/sh"),
        "allowedDirectories = [" + JSON.stringify(TEST_DIR) + "]",
        "fileReadLineLimit = 321",
        "fileWriteLineLimit = 654",
        "",
      ].join("\n"),
      "utf8",
    );

    await fs.writeFile(
      LEGACY_CONFIG_FILE,
      JSON.stringify(
        {
          blockedCommands: [],
          defaultShell: "legacy-shell",
          allowedDirectories: [BLOCKED_DIR],
          fileReadLineLimit: 999,
          fileWriteLineLimit: 999,
        },
        null,
        2,
      ),
      "utf8",
    );

    const config = await configManager.getConfig();
    assert.deepStrictEqual(config.allowedDirectories, [TEST_DIR], "config.toml allowedDirectories should win over legacy config.json");
    assert.strictEqual(config.fileReadLineLimit, 321, "config.toml fileReadLineLimit should be loaded");
    assert.strictEqual(config.fileWriteLineLimit, 654, "config.toml fileWriteLineLimit should be loaded");

    await validatePath(TEST_DIR);
    await assert.rejects(
      () => validatePath(BLOCKED_DIR),
      /Access denied|Path not allowed/,
      "Path outside config.toml allowedDirectories should be blocked",
    );
  } finally {
    await writeOptionalFile(CONFIG_FILE, originalToml);
    await writeOptionalFile(LEGACY_CONFIG_FILE, originalJson);
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(BLOCKED_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
