import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CONFIG_FILE, LEGACY_CONFIG_FILE } from "../../../out/features/config/config-paths.js";
import { configManager } from "../../../out/features/config/config-store.js";

const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-config-toml-migration");

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

  const originalToml = await readOptionalFile(CONFIG_FILE);
  const originalJson = await readOptionalFile(LEGACY_CONFIG_FILE);

  try {
    await fs.rm(CONFIG_FILE, { force: true });
    await fs.writeFile(
      LEGACY_CONFIG_FILE,
      JSON.stringify(
        {
          blockedCommands: [],
          defaultShell: "legacy-shell",
          allowedDirectories: [TEST_DIR],
          fileReadLineLimit: 123,
          fileWriteLineLimit: 456,
        },
        null,
        2,
      ),
      "utf8",
    );

    const config = await configManager.getConfig();
    assert.deepStrictEqual(config.allowedDirectories, [TEST_DIR], "Legacy config.json should migrate its allowedDirectories");
    assert.strictEqual(config.fileReadLineLimit, 123, "Legacy config.json should migrate fileReadLineLimit");
    assert.strictEqual(config.fileWriteLineLimit, 456, "Legacy config.json should migrate fileWriteLineLimit");

    const tomlContent = await fs.readFile(CONFIG_FILE, "utf8");
    assert.ok(tomlContent.includes("allowedDirectories = ["), "Migrated config.toml should be created");
    assert.ok(tomlContent.includes(TEST_DIR.replaceAll("\\", "\\\\")), "Migrated config.toml should preserve allowedDirectories");
  } finally {
    await writeOptionalFile(CONFIG_FILE, originalToml);
    await writeOptionalFile(LEGACY_CONFIG_FILE, originalJson);
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
