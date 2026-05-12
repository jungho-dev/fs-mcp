import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const ignoredDirectories = new Set([".git", "node_modules"]);
const forbiddenSuffixes = [".map", ".d.ts"];
const expectedBinShebang = "#!/usr/bin/env bun";

// 1. filesystem helpers ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// 2. bin entrypoint check ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function verifyBinEntrypoint() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const binTarget = packageJson.bin?.["fs-mcp"];
  const failures = [];

  if (typeof binTarget !== "string") {
    return ["Missing package bin entry: fs-mcp"];
  }

  const binPath = path.join(projectRoot, binTarget);
  if (!(await pathExists(binPath))) {
    return [`Missing package bin target: ${binTarget}`];
  }

  const binContent = await readFile(binPath, "utf8");
  const firstLine = binContent.split(/\r?\n/, 1)[0];
  if (firstLine !== expectedBinShebang) {
    failures.push(`Invalid fs-mcp bin shebang in ${binTarget}: expected "${expectedBinShebang}"`);
  }

  return failures;
}

// 3. forbidden artifact scan ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function collectForbiddenArtifacts(directoryPath, results = []) {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    if (ignoredDirectories.has(entry.name)) {
      return;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await collectForbiddenArtifacts(entryPath, results);
      return;
    }

    if (forbiddenSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      results.push(path.relative(projectRoot, entryPath));
    }
  }));

  return results;
}

// 4. release shape check ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const requiredDirectories = ["src", "out", "tests", path.join("tests", "scripts")];
  const missingDirectories = [];

  await Promise.all(requiredDirectories.map(async (directory) => {
    const directoryPath = path.join(projectRoot, directory);
    if (!(await pathExists(directoryPath))) {
      missingDirectories.push(directory);
    }
  }));

  const forbiddenArtifacts = await collectForbiddenArtifacts(projectRoot);
  const distExists = await pathExists(path.join(projectRoot, "dist"));
  const failures = await verifyBinEntrypoint();

  if (missingDirectories.length > 0) {
    failures.push(`Missing required directories: ${missingDirectories.join(", ")}`);
  }

  if (forbiddenArtifacts.length > 0) {
    failures.push(`Forbidden generated artifacts found: ${forbiddenArtifacts.join(", ")}`);
  }

  if (distExists) {
    failures.push("Unexpected dist directory found. Build output must stay in out.");
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
