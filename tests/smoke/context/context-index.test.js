import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {normalizeToolResult} from "../../../out/cores/responses/responses-tool-result.js";
import {handleClearContexts, handleIndexContexts, handleListContexts, handleSearchContexts} from "../../../out/controllers/controllers-context.js";
import {handleReadFiles} from "../../../out/controllers/controllers-filesystem.js";
import {configManager} from "../../../out/features/config/config-store.js";
import {contextIndexService} from "../../../out/features/context/context-index-service.js";

const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-context-index-test");
const TEST_DB = path.join(TEST_DIR, "context.sqlite");
const LARGE_FILE = path.join(TEST_DIR, "large.txt");

async function setup() {
  await fs.rm(TEST_DIR, {force: true, recursive: true});
  await fs.mkdir(TEST_DIR, {recursive: true});
  const originalConfig = await configManager.getConfig();

  await configManager.updateConfig({
    allowedDirectories: [TEST_DIR],
    contextIndexAutoMinChars: 100,
    contextIndexAutoMinLines: 3,
    contextIndexDbPath: TEST_DB,
    contextIndexEnabled: true,
    contextIndexMaxEntryChars: 10000,
  });
  return originalConfig;
}

async function teardown(originalConfig) {
  await configManager.updateConfig(originalConfig);
  contextIndexService.close();
  await fs.rm(TEST_DIR, {force: true, recursive: true});
}

function getStandardOutput(result) {
  assert.ok(result.structuredContent, "normalized result should include structuredContent");
  return result.structuredContent;
}

async function testExplicitIndexSearchListClear() {
  const content = [
    "alpha project context",
    "beta search target",
    "gamma sqlite fts payload",
    "delta durable context",
  ].join("\n");
  const indexed = await handleIndexContexts({
    items: [
      {
        source: "manual-test",
        content,
      },
    ],
  });

  assert.equal(indexed.isError, undefined, "index_contexts should succeed");
  const list = await handleListContexts({});
  assert.match(list.content[0].text, /manual-test/, "list_contexts should show indexed source");

  const searched = await handleSearchContexts({queries: ["sqlite target"], limit: 5});
  assert.match(searched.content[0].text, /manual-test/, "search_contexts should return indexed source");
  assert.match(searched.content[0].text, /sqlite fts payload/, "search_contexts should return matching chunk text");

  const cleared = await handleClearContexts({source: "manual-test"});
  assert.match(cleared.content[0].text, /Cleared 1 indexed context/, "clear_contexts should clear the indexed source");

  const searchedAfterClear = await handleSearchContexts({queries: ["sqlite target"], limit: 5});
  assert.match(searchedAfterClear.content[0].text, /Results: 0/, "cleared context should no longer be searchable");
}

async function testAutomaticReadFileCompaction() {
  const lines = Array.from({length: 20}, (_, index) => "line " + index + " automatic sqlite context target");
  await fs.writeFile(LARGE_FILE, lines.join("\n"), "utf8");

  const rawResult = await handleReadFiles({paths: [LARGE_FILE]});
  const normalized = normalizeToolResult("read_files", rawResult, 1);
  const output = getStandardOutput(normalized);

  assert.ok(Array.isArray(output.contextIndexes), "large read_files result should include contextIndexes");
  assert.ok(output.contextIndexes.length > 0, "contextIndexes should not be empty");
  assert.ok(output.data.structuredContent.results[0].result.structuredContent.textContent.indexed, "large textContent should be replaced with index reference");

  const searched = await handleSearchContexts({queries: ["automatic sqlite target"], limit: 5});
  assert.match(searched.content[0].text, /automatic sqlite context target/, "auto-indexed read file should be searchable");
}

async function testDefaultDbPathConfig() {
  const config = await configManager.getConfig();

  assert.equal(config.contextIndexDbPath, TEST_DB, "test override should be active");
  await configManager.resetConfig();
  const defaultConfig = await configManager.getConfig();
  assert.equal(defaultConfig.contextIndexDbPath, "~/.codex/fs-mcp/foo.sqlite", "default context DB path should match plan");
  await configManager.updateConfig({
    ...config,
    contextIndexDbPath: TEST_DB,
  });
}

async function runTests() {
  let originalConfig;
  try {
    originalConfig = await setup();
    await testExplicitIndexSearchListClear();
    await testAutomaticReadFileCompaction();
    await testDefaultDbPathConfig();
  }
  catch (error) {
    console.error("Test failed:", error.message);
    console.error(error.stack);
    return false;
  }
  finally {
    if (originalConfig !== undefined) {
      await teardown(originalConfig);
    }
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Unhandled error:", error);
      process.exit(1);
    });
}

export default runTests;
