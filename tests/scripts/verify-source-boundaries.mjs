import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const sourceRoot = path.join(projectRoot, "src");
const testRoot = path.join(projectRoot, "tests");
const requiredSourceEntries = new Set(["app", "assets", "features", "mcp", "index.ts"]);
const forbiddenSourceRootEntries = new Set(["config", "core", "handlers", "tests", "tools", "types"]);
const requiredTestEntries = new Set(["config", "contracts", "edit", "examples", "filesystem", "fixtures", "process", "run-all-tests.js", "scripts", "search", "security"]);
const scannedTextSurfaces = [path.join(projectRoot, "package.json"), path.join(projectRoot, "tsconfig.json"), path.join(projectRoot, "tests"), path.join(projectRoot, "src")];
const ignoredDirectories = new Set([".git", "node_modules", "out", "fixtures"]);
const textFileExtensions = new Set([".json", ".mjs", ".ts", ".ts", ".js", ".md", ".txt"]);
const forbiddenRuntimeTerm = ["caff", "einate"].join("");

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

async function collectTextFiles(targetPath, results = []) {
  const targetStat = await stat(targetPath);
  if (targetStat.isFile()) {
    if (textFileExtensions.has(path.extname(targetPath))) {
      results.push(targetPath);
    }
    return results;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(entryPath, results);
      continue;
    }

    if (textFileExtensions.has(path.extname(entry.name))) {
      results.push(entryPath);
    }
  }

  return results;
}

// 2. boundary checks ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function verifySourceRootEntries() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const missingEntries = [...requiredSourceEntries].filter((entry) => !names.has(entry)).sort();
  const forbiddenEntries = [...forbiddenSourceRootEntries].filter((entry) => names.has(entry)).sort();
  const failures = [];

  if (missingEntries.length > 0) {
    failures.push(`Missing src boundary entries: ${missingEntries.join(", ")}`);
  }

  if (forbiddenEntries.length > 0) {
    failures.push(`Legacy src root entries found: ${forbiddenEntries.join(", ")}`);
  }

  return failures;
}

async function verifyTestRootEntries() {
  const entries = await readdir(testRoot, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const missingEntries = [...requiredTestEntries].filter((entry) => !names.has(entry)).sort();
  const rootTestFiles = entries
    .filter((entry) => entry.isFile() && /^test.*\.(js|mjs)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const failures = [];

  if (missingEntries.length > 0) {
    failures.push(`Missing tests boundary entries: ${missingEntries.join(", ")}`);
  }

  if (rootTestFiles.length > 0) {
    failures.push(`Root test files must be topic-scoped: ${rootTestFiles.join(", ")}`);
  }

  return failures;
}

async function verifyForbiddenRuntimeTerms() {
  const failures = [];

  for (const surface of scannedTextSurfaces) {
    if (!(await pathExists(surface))) {
      continue;
    }

    const files = await collectTextFiles(surface);
    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (content.toLowerCase().includes(forbiddenRuntimeTerm)) {
        failures.push(`Forbidden removed platform helper reference: ${path.relative(projectRoot, file)}`);
      }
    }
  }

  return failures;
}

// 3. script runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const failures = [...(await verifySourceRootEntries()), ...(await verifyTestRootEntries()), ...(await verifyForbiddenRuntimeTerms())];

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
