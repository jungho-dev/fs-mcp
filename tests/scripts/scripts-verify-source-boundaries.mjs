import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";

const scriptPath = flUrlTPth2(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const sourceRoot = path.join(projectRoot, "src");
const testRoot = path.join(projectRoot, "tests");
const rqrdSrcEntr = new Set(["assets", "controllers", "cores", "features", "schemas", "tools", "index.mts"]);
const frbSrRtEn = new Set(["app", "config", "core", "domains", "handlers", "mcp", "responses", "tests", "types"]);
const rqrdTstEntr = new Set(["contracts", "fixtures", "run-all-tests.js", "scripts", "smoke"]);
const scnnTxtSrfc = [path.join(projectRoot, "package.json"), path.join(projectRoot, "tsconfig.json"), path.join(projectRoot, "tests"), path.join(projectRoot, "src")];
const ignrDrct = new Set([".git", "node_modules", "out", "fixtures"]);
const txtFlExts = new Set([".json", ".mjs", ".ts", ".ts", ".js", ".md", ".txt"]);
const frbdRtTrm = ["caff", "einate"].join("");

// 1. filesystem helpers ---------------------------------------------------------------------------
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

// 2. Collect text files ---------------------------------------------------------------------------
async function collectTextFiles(targetPath, results = []) {
  const targetStat = await stat(targetPath);
  if (targetStat.isFile()) {
    if (txtFlExts.has(path.extname(targetPath))) {
      results.push(targetPath);
    }
    return results;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory() && ignrDrct.has(entry.name)) {
      return;
    }

    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(entryPath, results);
      return;
    }

    if (txtFlExts.has(path.extname(entry.name))) {
      results.push(entryPath);
    }
  }));

  return results;
}

// 2. boundary checks ------------------------------------------------------------------------------
async function verifySourceRootEntries() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const mssnEntr = [...rqrdSrcEntr].filter((entry) => !names.has(entry)).sort();
  const frbdEntr = [...frbSrRtEn].filter((entry) => names.has(entry)).sort();
  const failures = [];

  if (mssnEntr.length > 0) {
    failures.push(`Missing src boundary entries: ${mssnEntr.join(", ")}`);
  }

  if (frbdEntr.length > 0) {
    failures.push(`Legacy src root entries found: ${frbdEntr.join(", ")}`);
  }

  return failures;
}

// 4. Verify test root entries ---------------------------------------------------------------------
async function verifyTestRootEntries() {
  const rtTstFlPat = /^test.*\.(js|mjs)$/;
  const entries = await readdir(testRoot, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const mssnEntr = [...rqrdTstEntr].filter((entry) => !names.has(entry)).sort();
  const rtTstFls = entries
    .filter((entry) => entry.isFile() && rtTstFlPat.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const failures = [];

  if (mssnEntr.length > 0) {
    failures.push(`Missing tests boundary entries: ${mssnEntr.join(", ")}`);
  }

  if (rtTstFls.length > 0) {
    failures.push(`Root test files must be topic-scoped: ${rtTstFls.join(", ")}`);
  }

  return failures;
}

// 5. Verify forbidden runtime terms ---------------------------------------------------------------
async function verifyForbiddenRuntimeTerms() {
  const failures = [];

  await Promise.all(scnnTxtSrfc.map(async (surface) => {
    if (!(await pathExists(surface))) {
      return;
    }

    const files = await collectTextFiles(surface);
    await Promise.all(files.map(async (file) => {
      const content = await readFile(file, "utf8");
      if (content.toLowerCase().includes(frbdRtTrm)) {
        failures.push(`Forbidden removed platform helper reference: ${path.relative(projectRoot, file)}`);
      }
    }));
  }));

  return failures;
}

// 3. script runner --------------------------------------------------------------------------------
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
