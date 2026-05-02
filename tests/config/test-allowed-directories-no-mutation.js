import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE, LEGACY_CONFIG_FILE } from "../../out/features/config/config-paths.mjs";
import { configManager } from "../../out/features/config/config-store.mjs";
import { validatePath } from "../../out/features/filesystem/filesystem-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const originalToml = await readOptionalFile(CONFIG_FILE);
  const originalJson = await readOptionalFile(LEGACY_CONFIG_FILE);

  const tomlContent = [
    "blockedCommands = []",
    "defaultShell = " + JSON.stringify(process.platform === "win32" ? "pwsh.exe" : "/bin/sh"),
    "fileReadLineLimit = 222",
    "fileWriteLineLimit = 333",
    "",
  ].join("\n");

  try {
    await fs.writeFile(CONFIG_FILE, tomlContent, "utf8");
    await fs.rm(LEGACY_CONFIG_FILE, { force: true });

    const config = await configManager.getConfig();
    assert.strictEqual(config.allowedDirectories, undefined, "allowedDirectories should stay undefined when omitted from config.toml");

    await validatePath(__dirname);

    const persistedToml = await fs.readFile(CONFIG_FILE, "utf8");
    assert.strictEqual(persistedToml, tomlContent, "Reading allowedDirectories must not rewrite config.toml");
    assert.ok(!persistedToml.includes("allowedDirectories"), "config.toml should not gain allowedDirectories during reads");
  } finally {
    await writeOptionalFile(CONFIG_FILE, originalToml);
    await writeOptionalFile(LEGACY_CONFIG_FILE, originalJson);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
