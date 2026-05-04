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
import { createBatchToolResponse } from "../../out/controllers/controllers-batch.js";
import { configManager } from "../../out/features/config/config-store.js";
import { dispatchToolCall } from "../../out/tools/tools-dispatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-batch-tool-contract");
const CREATED_DIR = path.join(TEST_DIR, "created-dir");
const SOURCE_FILE = path.join(TEST_DIR, "source.txt");
const EXTRA_FILE = path.join(TEST_DIR, "extra.txt");
const LARGE_FILE = path.join(TEST_DIR, "large.txt");
const LARGE_WRITTEN_FILE = path.join(TEST_DIR, "large-written.txt");
const MOVED_FILE = path.join(TEST_DIR, "moved.txt");
const RENAMED_FILE = path.join(TEST_DIR, "renamed.txt");
const WRITTEN_FILE = path.join(TEST_DIR, "written.txt");
const MANY_LINE_SOURCE_FILE = path.join(TEST_DIR, "many-line-source.txt");
const DISPLAY_LINE_SPLIT_PATTERN = /\r?\n/;
const OLD_VALUE_PATTERN = /old value/;
const EXTRA_VALUE_PATTERN = /extra value/;
const CREATED_DIR_PATTERN = /created-dir/;
const OMITTED_PATTERN = /omitted/;
const UNSTRUCTURED_LINE_PATTERN = /unstructured line 79/;
const READING_TWO_LINES_PATTERN = /Reading 2 lines/;
const THREE_HUNDRED_X_PATTERN = /x{300}/;
const THREE_HUNDRED_Y_PATTERN = /y{300}/;
const LARGE_TEXT = `${"x".repeat(300)}\n${"y".repeat(300)}\n`;
const TEN_THOUSAND_A = "a".repeat(10_000);
const TEN_THOUSAND_B = "b".repeat(10_000);
const MANY_LINE_PREFIX = Array.from({ length: 1100 }, (_value, index) => `prefix-${index}`).join("\n");
const MANY_LINE_TEXT = `${MANY_LINE_PREFIX}\n${TEN_THOUSAND_A}\n`;
const MANY_LINE_REPLACED_TEXT = `${MANY_LINE_PREFIX}\n${TEN_THOUSAND_B}\n`;

function parseToolOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  assert.ok(result.content[0].text.split(DISPLAY_LINE_SPLIT_PATTERN).length <= 5);
  assert.ok(result.content[0].text.length <= 30);
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
  await fs.writeFile(LARGE_FILE, LARGE_TEXT, "utf8");
  await fs.writeFile(MANY_LINE_SOURCE_FILE, MANY_LINE_TEXT, "utf8");
  await configManager.updateConfig({
    ...originalConfig,
    allowedDirectories: [TEST_DIR],
    fileReadLineLimit: 1,
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
  assert.ok(batchResults[0].result.content[0].text.length <= 30);
  assert.ok(batchResults[1].result.content[0].text.length <= 30);
  assert.match(batchResults[0].result.structuredContent.textContent, OLD_VALUE_PATTERN);
  assert.match(batchResults[1].result.structuredContent.textContent, EXTRA_VALUE_PATTERN);

  const largeResult = await dispatchToolCall("read_files", {
    paths: [LARGE_FILE],
  });
  const largeBatchResults = extractBatchResults(largeResult);

  assert.equal(largeBatchResults[0].ok, true);
  assert.match(largeBatchResults[0].result.content[0].text, OMITTED_PATTERN);
  assert.ok(largeBatchResults[0].result.content[0].text.length <= 30);
  assert.match(largeBatchResults[0].result.structuredContent.textContent, READING_TWO_LINES_PATTERN);
  assert.match(largeBatchResults[0].result.structuredContent.textContent, THREE_HUNDRED_X_PATTERN);
  assert.match(largeBatchResults[0].result.structuredContent.textContent, THREE_HUNDRED_Y_PATTERN);
}

function testLargeUnstructuredResultPreview() {
  const largeText = Array.from({ length: 80 }, (_value, index) => `unstructured line ${index} ${"z".repeat(40)}`).join("\n");
  const result = createBatchToolResponse("synthetic_tool", [
    {
      index: 1,
      input: { id: 1 },
      ok: true,
      result: {
        content: [{ type: "text", text: largeText }],
      },
    },
  ]);
  const batchResult = result.structuredContent.results[0].result;

  assert.match(batchResult.content[0].text, OMITTED_PATTERN);
  assert.ok(batchResult.content[0].text.length <= 30);
  assert.doesNotMatch(batchResult.content[0].text, UNSTRUCTURED_LINE_PATTERN);
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

  const largeWriteResult = await dispatchToolCall("write_files", {
    items: [
      {
        content: TEN_THOUSAND_A,
        mode: "rewrite",
        path: LARGE_WRITTEN_FILE,
      },
    ],
  });
  const largeWriteBatchResults = extractBatchResults(largeWriteResult);

  assert.equal(largeWriteBatchResults[0].ok, true);
  assert.equal(largeWriteBatchResults[0].input.content.omitted, true);
  assert.equal(largeWriteBatchResults[0].input.content.originalLength, TEN_THOUSAND_A.length);
  assert.equal(await fs.readFile(LARGE_WRITTEN_FILE, "utf8"), TEN_THOUSAND_A);

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

  const largeEditResult = await dispatchToolCall("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: MANY_LINE_SOURCE_FILE,
        new_string: TEN_THOUSAND_B,
        old_string: TEN_THOUSAND_A,
      },
    ],
  });
  const largeEditBatchResults = extractBatchResults(largeEditResult);
  assert.equal(largeEditBatchResults[0].ok, true);
  assert.equal(largeEditBatchResults[0].input.old_string.omitted, true);
  assert.equal(largeEditBatchResults[0].input.old_string.originalLength, TEN_THOUSAND_A.length);
  assert.equal(largeEditBatchResults[0].input.new_string.omitted, true);
  assert.equal(largeEditBatchResults[0].input.new_string.originalLength, TEN_THOUSAND_B.length);

  const largeReadResult = await dispatchToolCall("read_files", {
    paths: [MANY_LINE_SOURCE_FILE],
  });
  const largeReadBatchResults = extractBatchResults(largeReadResult);
  assert.equal(largeReadBatchResults[0].ok, true);
  assert.match(largeReadBatchResults[0].result.content[0].text, OMITTED_PATTERN);
  assert.ok(largeReadBatchResults[0].result.content[0].text.length <= 30);
  assert.ok(largeReadBatchResults[0].result.structuredContent.textContent.includes(TEN_THOUSAND_B));

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
  const largeEditedText = await fs.readFile(MANY_LINE_SOURCE_FILE, "utf8");
  const movedText = await fs.readFile(MOVED_FILE, "utf8");

  assert.equal(editedText, "new value\n");
  assert.equal(largeEditedText, MANY_LINE_REPLACED_TEXT);
  assert.equal(movedText, "written value\n");
}

async function main() {
  const originalConfig = await setup();

  try {
    await testReadFilesSurface();
    testLargeUnstructuredResultPreview();
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
