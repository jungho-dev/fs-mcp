import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const ignoredDirectories = new Set([".git", "node_modules"]);
const forbiddenSuffixes = [".map", ".d.ts"];

// 1. filesystem helpers ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// 2. forbidden artifact scan ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function collectForbiddenArtifacts(directoryPath, results = []) {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await collectForbiddenArtifacts(entryPath, results);
      continue;
    }

    if (forbiddenSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      results.push(path.relative(projectRoot, entryPath));
    }
  }

  return results;
}

// 3. release shape check ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const requiredDirectories = ["src", "out", "tests", path.join("tests", "scripts")];
  const missingDirectories = [];

  for (const directory of requiredDirectories) {
    const directoryPath = path.join(projectRoot, directory);
    if (!(await pathExists(directoryPath))) {
      missingDirectories.push(directory);
    }
  }

  const forbiddenArtifacts = await collectForbiddenArtifacts(projectRoot);
  const distExists = await pathExists(path.join(projectRoot, "dist"));
  const failures = [];

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
