/**
 * @file tests/contracts/version.contract.test.js
 * @description Runtime version contract tests.
 * @author JUNGHO
 * @since 2026-05-06
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../../out/cores/runtime/runtime-version.js";
import { configManager } from "../../out/features/config/config-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

// 1. Read package version ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function readPackageVersion() {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(typeof packageJson.version, "string");
  return packageJson.version;
}

// 2. Runtime version contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testRuntimeVersionMatchesPackage() {
  const packageVersion = await readPackageVersion();

  assert.equal(VERSION, packageVersion);
}

// 3. Config version contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testConfigVersionMatchesPackage() {
  const packageVersion = await readPackageVersion();
  const config = await configManager.getConfig();

  assert.equal(config.version, packageVersion);
}

// 4. Test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  await testRuntimeVersionMatchesPackage();
  await testConfigVersionMatchesPackage();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
