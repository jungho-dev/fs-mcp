/**
 * @file tests/smoke/edit/edit-lines-basic.test.js
 * @description file-edit-lines smoke tests for replace, delete, insert, and range validation.
 * @author JUNGHO
 * @since 2026-06-03
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";
import { dispatchToolCall as dsptTlCll } from "../../../out/tools/tools-dispatcher.js";

const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-edit-lines-smoke");
const CRLF_FILE = path.join(TEST_DIR, "crlf.txt");
const DELETE_FILE = path.join(TEST_DIR, "delete.txt");
const INSERT_FILE = path.join(TEST_DIR, "insert.txt");
const OOR_FILE = path.join(TEST_DIR, "out-of-range.txt");
const EXPC_FILE = path.join(TEST_DIR, "expected-lines.txt");

// 1. Extract batch results ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractBatchResults(result) {
  const output = result.structuredContent;

  assert.equal(typeof output, "object");
  assert.notEqual(output, null);
  return output.data.structuredContent.results;
}

// 2. Setup ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function setup() {
  const origCfg = await cfgMgr.getConfig();

  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(CRLF_FILE, "alpha\r\nbeta\r\ngamma\r\n", "utf8");
  await fs.writeFile(DELETE_FILE, "one\ntwo\nthree\nfour\n", "utf8");
  await fs.writeFile(INSERT_FILE, "first\nsecond\n", "utf8");
  await fs.writeFile(OOR_FILE, "only\n", "utf8");
  await fs.writeFile(EXPC_FILE, "a\nb\nc\n", "utf8");
  await cfgMgr.updateConfig({
    ...origCfg,
    allowedDirectories: [TEST_DIR],
  });

  return origCfg;
}

// 3. Teardown ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function teardown(origCfg) {
  await cfgMgr.updateConfig(origCfg);
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

// 4. Replace single line keeps CRLF ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testReplaceSingleLineCrlfPreserved() {
  const result = await dsptTlCll("file-edit-lines", {
    items: [{ file_path: CRLF_FILE, start_line: 2, replacement: "BETA" }],
  });
  const items = extractBatchResults(result);

  assert.equal(items[0].ok, true);
  assert.equal(items[0].result.structuredContent.action, "replace");
  assert.equal(items[0].result.structuredContent.eol, "crlf");
  assert.equal(items[0].result.structuredContent.start_line, 2);
  assert.equal(items[0].result.structuredContent.end_line, 2);
  assert.equal(await fs.readFile(CRLF_FILE, "utf8"), "alpha\r\nBETA\r\ngamma\r\n");
}

// 5. Delete range ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testDeleteRange() {
  const result = await dsptTlCll("file-edit-lines", {
    items: [{ file_path: DELETE_FILE, start_line: 2, end_line: 3, replacement: "" }],
  });
  const items = extractBatchResults(result);

  assert.equal(items[0].ok, true);
  assert.equal(items[0].result.structuredContent.action, "delete");
  assert.equal(items[0].result.structuredContent.lines_removed, 2);
  assert.equal(await fs.readFile(DELETE_FILE, "utf8"), "one\nfour\n");
}

// 6. Insert after line ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testInsertAfterLine() {
  const result = await dsptTlCll("file-edit-lines", {
    items: [{ file_path: INSERT_FILE, start_line: 1, end_line: 1, after: true, replacement: "inserted" }],
  });
  const items = extractBatchResults(result);

  assert.equal(items[0].ok, true);
  assert.equal(items[0].result.structuredContent.action, "insert_after");
  assert.equal(items[0].result.structuredContent.lines_removed, 0);
  assert.equal(await fs.readFile(INSERT_FILE, "utf8"), "first\ninserted\nsecond\n");
}

// 7. Rejects out-of-range start line ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testRejectsOutOfRange() {
  const result = await dsptTlCll("file-edit-lines", {
    items: [{ file_path: OOR_FILE, start_line: 9, replacement: "nope" }],
  });
  const items = extractBatchResults(result);

  assert.equal(result.isError, true);
  assert.equal(items[0].ok, false);
  assert.match(result.structuredContent.data.content[0].text, /exceeds file line count/);
  assert.equal(await fs.readFile(OOR_FILE, "utf8"), "only\n");
}

// 8. Enforces expected_lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testEnforcesExpectedLines() {
  const mismatch = await dsptTlCll("file-edit-lines", {
    items: [{ file_path: EXPC_FILE, start_line: 1, replacement: "z", expected_lines: 99 }],
  });
  const mismatchItems = extractBatchResults(mismatch);

  assert.equal(mismatchItems[0].ok, false);
  assert.equal(await fs.readFile(EXPC_FILE, "utf8"), "a\nb\nc\n");

  const matched = await dsptTlCll("file-edit-lines", {
    items: [{ file_path: EXPC_FILE, start_line: 1, replacement: "z", expected_lines: 3 }],
  });
  const matchedItems = extractBatchResults(matched);

  assert.equal(matchedItems[0].ok, true);
  assert.equal(await fs.readFile(EXPC_FILE, "utf8"), "z\nb\nc\n");
}

// 9. Main ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const origCfg = await setup();

  try {
    await testReplaceSingleLineCrlfPreserved();
    await testDeleteRange();
    await testInsertAfterLine();
    await testRejectsOutOfRange();
    await testEnforcesExpectedLines();
  }
  finally {
    await teardown(origCfg);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
