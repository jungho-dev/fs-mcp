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
const COPY_SOURCE_FILE = path.join(TEST_DIR, "copy-source.txt");
const COPIED_FILE = path.join(TEST_DIR, "copied.txt");
const COPIED_FORCE_FILE = path.join(TEST_DIR, "copied-force.txt");
const COPY_SOURCE_DIR = path.join(TEST_DIR, "copy-source-dir");
const COPIED_DIR = path.join(TEST_DIR, "copied-dir");
const LARGE_FILE = path.join(TEST_DIR, "large.txt");
const LARGE_WRITTEN_FILE = path.join(TEST_DIR, "large-written.txt");
const LARGE_WRITE_REF_FILE = path.join(TEST_DIR, "large-write-ref.txt");
const ARGS_PATH_WRITTEN_FILE = path.join(TEST_DIR, "args-path-written.txt");
const ARGS_PATH_WRITE_ARGS_FILE = path.join(TEST_DIR, "args-path-write-args.json");
const OVERSIZED_INLINE_WRITTEN_FILE = path.join(TEST_DIR, "oversized-inline-written.txt");
const PARTIAL_WRITTEN_FILE = path.join(TEST_DIR, "partial-written.txt");
const PARTIAL_WRITE_REF_FILE = path.join(TEST_DIR, "partial-write-ref.txt");
const LARGE_EDIT_OLD_REF_FILE = path.join(TEST_DIR, "large-edit-old-ref.txt");
const LARGE_EDIT_NEW_REF_FILE = path.join(TEST_DIR, "large-edit-new-ref.txt");
const PARTIAL_EDIT_FILE = path.join(TEST_DIR, "partial-edit.txt");
const PARTIAL_EDIT_OLD_REF_FILE = path.join(TEST_DIR, "partial-edit-old-ref.txt");
const PARTIAL_EDIT_NEW_REF_FILE = path.join(TEST_DIR, "partial-edit-new-ref.txt");
const ARGS_PATH_EDIT_FILE = path.join(TEST_DIR, "args-path-edit.txt");
const ARGS_PATH_EDIT_SECOND_FILE = path.join(TEST_DIR, "args-path-edit-second.txt");
const ARGS_PATH_EDIT_ARGS_FILE = path.join(TEST_DIR, "args-path-edit-args.json");
const MOVED_FILE = path.join(TEST_DIR, "moved.txt");
const RENAMED_FILE = path.join(TEST_DIR, "renamed.txt");
const WRITTEN_FILE = path.join(TEST_DIR, "written.txt");
const MANY_LINE_SOURCE_FILE = path.join(TEST_DIR, "many-line-source.txt");
const BATCH_RESULT_PREVIEW_MAX_CHARS = 160;
const OLD_VALUE_PATTERN = /old value/;
const EXTRA_VALUE_PATTERN = /extra value/;
const CREATED_DIR_PATTERN = /created-dir/;
const PREVIEW_PATTERN = /preview/;
const UNSTRUCTURED_LINE_PATTERN = /unstructured line 79/;
const READING_TWO_LINES_PATTERN = /Reading 2 lines/;
const THREE_HUNDRED_X_PATTERN = /x{300}/;
const THREE_HUNDRED_Y_PATTERN = /y{300}/;
const LARGE_INLINE_CONTENT_PATTERN = /Large inline content can stall MCP hosts/;
const CONTENT_PATH_OR_ARGS_PATH_PATTERN = /content_path or args_path/;
const LARGE_TEXT = `${"x".repeat(300)}\n${"y".repeat(300)}\n`;
const TEN_THOUSAND_A = "a".repeat(10_000);
const TEN_THOUSAND_B = "b".repeat(10_000);
const MANY_LINE_PREFIX = Array.from({ length: 1100 }, (_value, index) => `prefix-${index}`).join("\n");
const MANY_LINE_TEXT = `${MANY_LINE_PREFIX}\n${TEN_THOUSAND_A}\n`;
const MANY_LINE_REPLACED_TEXT = `${MANY_LINE_PREFIX}\n${TEN_THOUSAND_B}\n`;

// 1. Parse tool output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseToolOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.ok(result.content[0].text.length > 0);
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  return result.structuredContent;
}

// 2. Extract batch results ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractBatchResults(result) {
  const output = parseToolOutput(result);
  const batchPayload = output.data.structuredContent;

  assert.equal(typeof batchPayload.totalCount, "number");
  assert.equal(Array.isArray(batchPayload.results), true);
  return batchPayload.results;
}

// 1. Path exists helper ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  }
  catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// 4. Setup ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function setup() {
  const originalConfig = await configManager.getConfig();

  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(SOURCE_FILE, "old value\n", "utf8");
  await fs.writeFile(EXTRA_FILE, "extra value\n", "utf8");
  await fs.writeFile(COPY_SOURCE_FILE, "copy value\n", "utf8");
  await fs.writeFile(COPIED_FORCE_FILE, "old copy\n", "utf8");
  await fs.mkdir(COPY_SOURCE_DIR, { recursive: true });
  await fs.writeFile(path.join(COPY_SOURCE_DIR, "nested.txt"), "nested copy\n", "utf8");
  await fs.writeFile(LARGE_FILE, LARGE_TEXT, "utf8");
  await fs.writeFile(LARGE_WRITE_REF_FILE, TEN_THOUSAND_A, "utf8");
  await fs.writeFile(PARTIAL_WRITE_REF_FILE, "abc\0\0", "utf8");
  await fs.writeFile(LARGE_EDIT_OLD_REF_FILE, TEN_THOUSAND_A, "utf8");
  await fs.writeFile(LARGE_EDIT_NEW_REF_FILE, TEN_THOUSAND_B, "utf8");
  await fs.writeFile(PARTIAL_EDIT_FILE, "alpha\n", "utf8");
  await fs.writeFile(PARTIAL_EDIT_OLD_REF_FILE, "alpha\0\0", "utf8");
  await fs.writeFile(PARTIAL_EDIT_NEW_REF_FILE, "omega\0\0", "utf8");
  await fs.writeFile(ARGS_PATH_EDIT_FILE, "alpha\nbeta\n", "utf8");
  await fs.writeFile(ARGS_PATH_EDIT_SECOND_FILE, "one\ntwo\n", "utf8");
  await fs.writeFile(MANY_LINE_SOURCE_FILE, MANY_LINE_TEXT, "utf8");
  await configManager.updateConfig({
    ...originalConfig,
    allowedDirectories: [TEST_DIR],
    contextIndexEnabled: false,
    fileReadLineLimit: 1,
  });

  return originalConfig;
}

// 5. Teardown ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function teardown(originalConfig) {
  await configManager.updateConfig(originalConfig);
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

// 6. Test read files surface ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testReadFilesSurface() {
  const result = await dispatchToolCall("read_files", {
    paths: [SOURCE_FILE, EXTRA_FILE],
  });
  const batchResults = extractBatchResults(result);

  assert.equal(batchResults.length, 2);
  assert.equal(batchResults[0].ok, true);
  assert.ok(batchResults[0].result.content[0].text.length <= BATCH_RESULT_PREVIEW_MAX_CHARS);
  assert.ok(batchResults[1].result.content[0].text.length <= BATCH_RESULT_PREVIEW_MAX_CHARS);
  assert.match(batchResults[0].result.structuredContent.textContent, OLD_VALUE_PATTERN);
  assert.match(batchResults[1].result.structuredContent.textContent, EXTRA_VALUE_PATTERN);

  const largeResult = await dispatchToolCall("read_files", {
    paths: [LARGE_FILE],
  });
  const largeBatchResults = extractBatchResults(largeResult);

  assert.equal(largeBatchResults[0].ok, true);
  assert.doesNotMatch(largeBatchResults[0].result.content[0].text, PREVIEW_PATTERN);
  assert.match(largeBatchResults[0].result.content[0].text, THREE_HUNDRED_X_PATTERN);
  assert.match(largeBatchResults[0].result.content[0].text, THREE_HUNDRED_Y_PATTERN);
  assert.match(largeBatchResults[0].result.structuredContent.textContent, READING_TWO_LINES_PATTERN);
  assert.match(largeBatchResults[0].result.structuredContent.textContent, THREE_HUNDRED_X_PATTERN);
  assert.match(largeBatchResults[0].result.structuredContent.textContent, THREE_HUNDRED_Y_PATTERN);

  const missingFile = path.join(TEST_DIR, "missing.txt");
  const defaultMissingResult = await dispatchToolCall("read_files", {
    paths: [missingFile],
  });
  const defaultMissingPayload = parseToolOutput(defaultMissingResult).data.structuredContent;
  assert.equal(defaultMissingPayload.failedCount, 1);

  const allowedMissingResult = await dispatchToolCall("read_files", {
    allowMissing: true,
    paths: [SOURCE_FILE, missingFile],
  });
  const allowedMissingPayload = parseToolOutput(allowedMissingResult).data.structuredContent;
  assert.equal(allowedMissingPayload.failedCount, 0);
  assert.equal(allowedMissingPayload.results[1].ok, true);
  assert.equal(allowedMissingPayload.results[1].result.structuredContent.missing, true);

  const missingInfoResult = await dispatchToolCall("get_file_infos", {
    allowMissing: true,
    paths: [missingFile],
  });
  const missingInfoPayload = parseToolOutput(missingInfoResult).data.structuredContent;
  assert.equal(missingInfoPayload.failedCount, 0);
  assert.equal(missingInfoPayload.results[0].result.structuredContent.missing, true);

  const missingDirectoryResult = await dispatchToolCall("list_directories", {
    allowMissing: true,
    items: [{ path: path.join(TEST_DIR, "missing-dir") }],
  });
  const missingDirectoryPayload = parseToolOutput(missingDirectoryResult).data.structuredContent;
  assert.equal(missingDirectoryPayload.failedCount, 0);
  assert.equal(missingDirectoryPayload.results[0].result.structuredContent.missing, true);
}

// 7. Test large unstructured result preview ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testLargeUnstructuredResultPreview() {
  const unstructuredLineZeroPattern = /unstructured line 0/;
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

  assert.match(batchResult.content[0].text, PREVIEW_PATTERN);
  assert.ok(batchResult.content[0].text.length <= BATCH_RESULT_PREVIEW_MAX_CHARS);
  assert.match(batchResult.content[0].text, unstructuredLineZeroPattern);
  assert.doesNotMatch(batchResult.content[0].text, UNSTRUCTURED_LINE_PATTERN);
  assert.match(batchResult.structuredContent.textContent, UNSTRUCTURED_LINE_PATTERN);
}

// 8. Test create and list directory surface ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 9. Test copy files surface ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testCopyFilesSurface() {
  const copyResult = await dispatchToolCall("copy_files", {
    items: [
      {
        destination: COPIED_FILE,
        source: COPY_SOURCE_FILE,
      },
      {
        destination: COPIED_FORCE_FILE,
        force: true,
        source: COPY_SOURCE_FILE,
      },
      {
        destination: COPIED_DIR,
        recursive: true,
        source: COPY_SOURCE_DIR,
      },
    ],
  });
  const copyBatchResults = extractBatchResults(copyResult);

  assert.equal(copyBatchResults.length, 3);
  assert.equal(copyBatchResults[0].ok, true);
  assert.equal(copyBatchResults[1].ok, true);
  assert.equal(copyBatchResults[2].ok, true);
  assert.equal(await fs.readFile(COPIED_FILE, "utf8"), "copy value\n");
  assert.equal(await fs.readFile(COPIED_FORCE_FILE, "utf8"), "copy value\n");
  assert.equal(await fs.readFile(path.join(COPIED_DIR, "nested.txt"), "utf8"), "nested copy\n");
  assert.equal(await fs.readFile(COPY_SOURCE_FILE, "utf8"), "copy value\n");

  const overwriteResult = await dispatchToolCall("copy_files", {
    items: [
      {
        destination: COPIED_FILE,
        source: COPY_SOURCE_FILE,
      },
    ],
  });
  const overwriteBatchResults = extractBatchResults(overwriteResult);
  assert.equal(overwriteBatchResults[0].ok, false);
}

// 10. Test write move info and edit surface ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
        content_path: LARGE_WRITE_REF_FILE,
        mode: "rewrite",
        path: LARGE_WRITTEN_FILE,
      },
    ],
  });
  const largeWriteBatchResults = extractBatchResults(largeWriteResult);

  assert.equal(largeWriteBatchResults[0].ok, true);
  assert.equal(largeWriteBatchResults[0].input.content_path, LARGE_WRITE_REF_FILE);
  assert.equal(await fs.readFile(LARGE_WRITTEN_FILE, "utf8"), TEN_THOUSAND_A);

  const argsPathWritePayload = {
    items: [
      {
        content: TEN_THOUSAND_B,
        mode: "rewrite",
        path: ARGS_PATH_WRITTEN_FILE,
      },
    ],
  };
  const argsPathWritePayloadText = JSON.stringify(argsPathWritePayload);
  const argsPathWriteCall = { args_length: argsPathWritePayloadText.length, args_path: ARGS_PATH_WRITE_ARGS_FILE };

  await fs.writeFile(ARGS_PATH_WRITE_ARGS_FILE, `${argsPathWritePayloadText}\0\0`, "utf8");
  assert.ok(JSON.stringify(argsPathWriteCall).length < JSON.stringify(argsPathWritePayload).length);
  const argsPathWriteResult = await dispatchToolCall("write_files", argsPathWriteCall);
  const argsPathWriteBatchResults = extractBatchResults(argsPathWriteResult);
  assert.equal(argsPathWriteBatchResults.length, 1);
  assert.equal(argsPathWriteBatchResults[0].ok, true);
  assert.equal(argsPathWriteBatchResults[0].input.contentLength, TEN_THOUSAND_B.length);
  assert.equal(await fs.readFile(ARGS_PATH_WRITTEN_FILE, "utf8"), TEN_THOUSAND_B);

  const oversizedInlineWriteResult = await dispatchToolCall("write_files", {
    items: [
      {
        content: "z".repeat(20_000),
        mode: "rewrite",
        path: OVERSIZED_INLINE_WRITTEN_FILE,
      },
    ],
  });
  const oversizedInlineWriteOutput = parseToolOutput(oversizedInlineWriteResult);

  assert.equal(oversizedInlineWriteResult.isError, true);
  assert.equal(oversizedInlineWriteOutput.status, "error");
  assert.match(oversizedInlineWriteOutput.error.message, LARGE_INLINE_CONTENT_PATTERN);
  assert.match(oversizedInlineWriteOutput.error.message, CONTENT_PATH_OR_ARGS_PATH_PATTERN);
  assert.equal(await pathExists(OVERSIZED_INLINE_WRITTEN_FILE), false);

  const partialWriteResult = await dispatchToolCall("write_files", {
    items: [
      {
        content_length: 3,
        content_path: PARTIAL_WRITE_REF_FILE,
        mode: "rewrite",
        path: PARTIAL_WRITTEN_FILE,
      },
    ],
  });
  const partialWriteBatchResults = extractBatchResults(partialWriteResult);
  assert.equal(partialWriteBatchResults[0].ok, true);
  assert.equal(await fs.readFile(PARTIAL_WRITTEN_FILE, "utf8"), "abc");

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
        new_string_path: LARGE_EDIT_NEW_REF_FILE,
        old_string_path: LARGE_EDIT_OLD_REF_FILE,
      },
    ],
  });
  const largeEditBatchResults = extractBatchResults(largeEditResult);
  assert.equal(largeEditBatchResults[0].ok, true);
  assert.equal(largeEditBatchResults[0].input.old_string_path, LARGE_EDIT_OLD_REF_FILE);
  assert.equal(largeEditBatchResults[0].input.new_string_path, LARGE_EDIT_NEW_REF_FILE);

  const partialEditResult = await dispatchToolCall("edit_blocks", {
    items: [
      {
        expected_replacements: 1,
        file_path: PARTIAL_EDIT_FILE,
        new_string_length: 5,
        new_string_path: PARTIAL_EDIT_NEW_REF_FILE,
        old_string_length: 5,
        old_string_path: PARTIAL_EDIT_OLD_REF_FILE,
      },
    ],
  });
  const partialEditBatchResults = extractBatchResults(partialEditResult);
  assert.equal(partialEditBatchResults[0].ok, true);
  assert.equal(await fs.readFile(PARTIAL_EDIT_FILE, "utf8"), "omega\n");

  const argsPathEditPayload = {
    items: [
      {
        expected_replacements: 1,
        file_path: ARGS_PATH_EDIT_FILE,
        new_string: "gamma",
        old_string: "alpha",
      },
      {
        expected_replacements: 1,
        file_path: ARGS_PATH_EDIT_SECOND_FILE,
        new_string: "delta",
        old_string: "two",
      },
    ],
  };
  const argsPathPayloadText = JSON.stringify(argsPathEditPayload);
  const argsPathCall = { args_length: argsPathPayloadText.length, args_path: ARGS_PATH_EDIT_ARGS_FILE };

  await fs.writeFile(ARGS_PATH_EDIT_ARGS_FILE, `${argsPathPayloadText}\0\0`, "utf8");
  assert.ok(JSON.stringify(argsPathCall).length < JSON.stringify(argsPathEditPayload).length);
  const argsPathEditResult = await dispatchToolCall("edit_blocks", argsPathCall);
  const argsPathEditBatchResults = extractBatchResults(argsPathEditResult);
  assert.equal(argsPathEditBatchResults.length, 2);
  assert.equal(argsPathEditBatchResults[0].ok, true);
  assert.equal(argsPathEditBatchResults[1].ok, true);
  assert.equal(await fs.readFile(ARGS_PATH_EDIT_FILE, "utf8"), "gamma\nbeta\n");
  assert.equal(await fs.readFile(ARGS_PATH_EDIT_SECOND_FILE, "utf8"), "one\ndelta\n");

  const largeReadResult = await dispatchToolCall("read_files", {
    paths: [MANY_LINE_SOURCE_FILE],
  });
  const largeReadBatchResults = extractBatchResults(largeReadResult);
  assert.equal(largeReadBatchResults[0].ok, true);
  assert.doesNotMatch(largeReadBatchResults[0].result.content[0].text, PREVIEW_PATTERN);
  assert.ok(largeReadBatchResults[0].result.content[0].text.includes(TEN_THOUSAND_B));
  assert.ok(largeReadBatchResults[0].result.structuredContent.textContent.includes(TEN_THOUSAND_B));

  const renameResult = await dispatchToolCall("move_files", {
    items: [
      {
        destination: RENAMED_FILE,
        source: WRITTEN_FILE,
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

  const removeResult = await dispatchToolCall("remove_files", {
    items: [
      { path: MOVED_FILE },
      { path: CREATED_DIR },
    ],
  });
  const removeBatchResults = extractBatchResults(removeResult);
  assert.equal(removeBatchResults.length, 2);
  assert.equal(removeBatchResults[0].ok, true);
  assert.equal(removeBatchResults[1].ok, true);
  assert.equal(await pathExists(MOVED_FILE), false);
  assert.equal(await pathExists(CREATED_DIR), false);
}

// 10. Main ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const originalConfig = await setup();

  try {
    await testReadFilesSurface();
    testLargeUnstructuredResultPreview();
    await testCreateAndListDirectorySurface();
    await testCopyFilesSurface();
    await testWriteMoveInfoAndEditSurface();
  }
  finally {
    await teardown(originalConfig);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
