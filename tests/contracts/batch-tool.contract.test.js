/**
 * @file tests/contracts/batch-tool.contract.test.js
 * @description Batch tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-03
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "../../out/features/config/config-store.js";
import { dispatchToolCall } from "../../out/tools/tools-dispatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-batch-tool-contract");
const CREATED_DIR = path.join(TEST_DIR, "created-dir");
const SOURCE_FILE = path.join(TEST_DIR, "source.txt");
const EXTRA_FILE = path.join(TEST_DIR, "extra.txt");
const MOVED_FILE = path.join(TEST_DIR, "moved.txt");
const RENAMED_FILE = path.join(TEST_DIR, "renamed.txt");
const WRITTEN_FILE = path.join(TEST_DIR, "written.txt");
const DISPLAY_LINE_SPLIT_PATTERN = /\r?\n/;
const OLD_VALUE_PATTERN = /old value/;
const EXTRA_VALUE_PATTERN = /extra value/;
const CREATED_DIR_PATTERN = /created-dir/;

function parseToolOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  assert.ok(result.content[0].text.split(DISPLAY_LINE_SPLIT_PATTERN).length <= 5);
  return result.structuredContent;
}

function extractBatchResults(result) {
  const output = parseToolOutput(result);
  const batchPayload = output.data.structuredContent;

  assert.equal(typeof batchPayload.totalCount, "number");
  assert.equal(Array.isArray(batchPayload.results), true);
  return batchPayload.results;
}

async function setup() {
  const originalConfig = await configManager.getConfig();

  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(SOURCE_FILE, "old value\n", "utf8");
  await fs.writeFile(EXTRA_FILE, "extra value\n", "utf8");
  await configManager.updateConfig({
    ...originalConfig,
    allowedDirectories: [TEST_DIR],
  });

  return originalConfig;
}

async function teardown(originalConfig) {
  await configManager.updateConfig(originalConfig);
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

async function testReadFilesSurface() {
  const result = await dispatchToolCall("read_files", {
    paths: [SOURCE_FILE, EXTRA_FILE],
  });
  const batchResults = extractBatchResults(result);

  assert.equal(batchResults.length, 2);
  assert.equal(batchResults[0].ok, true);
  assert.match(batchResults[0].result.content[0].text, OLD_VALUE_PATTERN);
  assert.match(batchResults[1].result.content[0].text, EXTRA_VALUE_PATTERN);
}

async function testCreateAndListDirectorySurface() {
  const createResult = await dispatchToolCall("create_directories", {
    paths: [CREATED_DIR],
  });
  const createBatchResults = extractBatchResults(createResult);
  assert.equal(createBatchResults[0].ok, true);

  const listResult = await dispatchToolCall("list_directories", {
    items: [
      {
        depth: 2,
        path: TEST_DIR,
      },
    ],
  });
  const listBatchResults = extractBatchResults(listResult);

  assert.equal(listBatchResults.length, 1);
  assert.equal(listBatchResults[0].ok, true);
  assert.match(listBatchResults[0].result.structuredContent.listing, CREATED_DIR_PATTERN);
}

async function testWriteMoveInfoAndEditSurface() {
  const writeResult = await dispatchToolCall("write_files", {
    items: [
      {
        content: "written value\n",
        mode: "rewrite",
        path: WRITTEN_FILE,
      },
    ],
  });
  const writeBatchResults = extractBatchResults(writeResult);
  assert.equal(writeBatchResults[0].ok, true);

  const editResult = await dispatchToolCall("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: SOURCE_FILE,
        new_string: "new value",
        old_string: "old value",
      },
    ],
  });
  const editBatchResults = extractBatchResults(editResult);
  assert.equal(editBatchResults[0].ok, true);

  const renameResult = await dispatchToolCall("rename_files", {
    items: [
      {
        newName: path.basename(RENAMED_FILE),
        path: WRITTEN_FILE,
      },
    ],
  });
  const renameBatchResults = extractBatchResults(renameResult);
  assert.equal(renameBatchResults[0].ok, true);

  const moveResult = await dispatchToolCall("move_files", {
    items: [
      {
        destination: MOVED_FILE,
        source: RENAMED_FILE,
      },
    ],
  });
  const moveBatchResults = extractBatchResults(moveResult);
  assert.equal(moveBatchResults[0].ok, true);

  const infoResult = await dispatchToolCall("get_file_infos", {
    paths: [SOURCE_FILE, MOVED_FILE],
  });
  const infoBatchResults = extractBatchResults(infoResult);
  assert.equal(infoBatchResults.length, 2);
  assert.equal(infoBatchResults[0].ok, true);
  assert.equal(infoBatchResults[1].ok, true);

  const editedText = await fs.readFile(SOURCE_FILE, "utf8");
  const movedText = await fs.readFile(MOVED_FILE, "utf8");

  assert.equal(editedText, "new value\n");
  assert.equal(movedText, "written value\n");
}

async function main() {
  const originalConfig = await setup();

  try {
    await testReadFilesSurface();
    await testCreateAndListDirectorySurface();
    await testWriteMoveInfoAndEditSurface();
  } finally {
    await teardown(originalConfig);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
