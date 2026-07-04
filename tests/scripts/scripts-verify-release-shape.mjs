import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";

const scriptPath = flUrlTPth2(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const pckgJsnPth2 = path.join(projectRoot, "package.json");
const ignrDrct = new Set([".git", "node_modules"]);
const frbdSffx = [".map", ".d.ts"];
const expBnShbn = "#!/usr/bin/env bun";

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

// 2. bin entrypoint check --------------------------------------------------------------------------
async function verifyBinEntrypoint() {
  const packageJson = JSON.parse(await readFile(pckgJsnPth2, "utf8"));
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
  if (firstLine !== expBnShbn) {
    failures.push(`Invalid fs-mcp bin shebang in ${binTarget}: expected "${expBnShbn}"`);
  }

  return failures;
}

// 3. forbidden artifact scan ----------------------------------------------------------------------
async function collectForbiddenArtifacts(dirPth2, results = []) {
  const entries = await readdir(dirPth2, { withFileTypes: true });

  await Promise.all(entries.map(async (entry) => {
    if (ignrDrct.has(entry.name)) {
      return;
    }

    const entryPath = path.join(dirPth2, entry.name);
    if (entry.isDirectory()) {
      await collectForbiddenArtifacts(entryPath, results);
      return;
    }

    if (frbdSffx.some((suffix) => entry.name.endsWith(suffix))) {
      results.push(path.relative(projectRoot, entryPath));
    }
  }));

  return results;
}

// 4. release shape check --------------------------------------------------------------------------
async function main() {
  const rqrdDrct = ["src", "out", "tests", path.join("tests", "scripts")];
  const mssnDrct = [];

  await Promise.all(rqrdDrct.map(async (directory) => {
    const dirPth2 = path.join(projectRoot, directory);
    if (!(await pathExists(dirPth2))) {
      mssnDrct.push(directory);
    }
  }));

  const frbdArtf = await collectForbiddenArtifacts(projectRoot);
  const distExists = await pathExists(path.join(projectRoot, "dist"));
  const failures = await verifyBinEntrypoint();

  if (mssnDrct.length > 0) {
    failures.push(`Missing required directories: ${mssnDrct.join(", ")}`);
  }

  if (frbdArtf.length > 0) {
    failures.push(`Forbidden generated artifacts found: ${frbdArtf.join(", ")}`);
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
