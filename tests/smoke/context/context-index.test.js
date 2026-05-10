import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {handleClearContexts, handleIndexContexts, handleListContexts, handleSearchContexts} from "../../../out/controllers/controllers-context.js";
import {handleReadFiles} from "../../../out/controllers/controllers-filesystem.js";
import {normalizeToolResult} from "../../../out/cores/responses/responses-tool-result.js";
import {getCurrentClient, updateCurrentClient} from "../../../out/features/config/config-client.js";
import {configManager} from "../../../out/features/config/config-store.js";
import {contextIndexService} from "../../../out/features/context/context-index-service.js";

const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-context-index-test");
const TEST_DB = path.join(TEST_DIR, "context.sqlite");
const LARGE_FILE = path.join(TEST_DIR, "large.txt");

async function setup() {
  await fs.rm(TEST_DIR, {force: true, recursive: true});
  await fs.mkdir(TEST_DIR, {recursive: true});
  const originalConfig = await configManager.getConfig();
  const originalClient = getCurrentClient();

  await configManager.updateConfig({
    allowedDirectories: [TEST_DIR],
    contextIndexAutoMinChars: 100,
    contextIndexAutoMinLines: 3,
    contextIndexDbPath: TEST_DB,
    contextIndexEnabled: true,
    contextIndexMaxEntryChars: 10_000,
  });
  return {originalClient, originalConfig};
}

async function teardown(originalState) {
  updateCurrentClient(originalState.originalClient);
  await configManager.updateConfig(originalState.originalConfig);
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
  const lines = Array.from({length: 20}, (_value, index) => `line ${index} automatic sqlite context target`);
  await fs.writeFile(LARGE_FILE, lines.join("\n"), "utf8");

  const rawResult = await handleReadFiles({paths: [LARGE_FILE]});
  const normalized = normalizeToolResult("read_files", rawResult, 1);
  const output = getStandardOutput(normalized);

  assert.ok(Array.isArray(output.contextIndexes), "large read_files result should include contextIndexes");
  assert.ok(output.contextIndexes.length > 0, "contextIndexes should not be empty");
  assert.equal(output.data.structuredContent.results[0].result.structuredContent.textContent, lines.join("\n"), "large textContent should stay available in structuredContent");
  assert.equal(normalized.content[0].text.includes("automatic sqlite context target"), false, "display text should not include raw file data");
  assert.match(normalized.content[0].text, /^tool=read_files \| status=success \| textChars=\d+ \| structuredChars=\d+ \| contentItems=1 \| contextIndexes=\d+$/, "display text should show status and lengths only");

  const searched = await handleSearchContexts({queries: ["automatic sqlite target"], limit: 5});
  assert.match(searched.content[0].text, /automatic sqlite context target/, "auto-indexed read file should be searchable");
}

async function testDuplicateContextIndexReuse() {
  const content = Array.from({length: 20}, (_value, index) => `duplicate line ${index} sqlite reuse target`).join("\n");
  const first = contextIndexService.indexText("duplicate-test", content, "duplicate_tool");
  const second = contextIndexService.indexText("duplicate-test", content, "duplicate_tool");
  const matchingDocuments = contextIndexService.listDocuments().filter((document) => document.source === "duplicate-test");

  assert.equal(second.indexId, first.indexId, "duplicate content should reuse the existing indexId");
  assert.equal(matchingDocuments.length, 1, "duplicate content should not create extra context documents");
  contextIndexService.clearDocuments({source: "duplicate-test"});
}

async function testDefaultDbPathConfig() {
  const config = await configManager.getConfig();

  assert.equal(config.contextIndexDbPath, TEST_DB, "test override should be active");
  await configManager.resetConfig();
  updateCurrentClient({name: "Codex", version: "1.0.0"});
  let defaultConfig = await configManager.getConfig();
  assert.equal(defaultConfig.contextIndexDbPath, "~/.codex/sqlite/fs-mcp.sqlite", "codex client should use the codex default context DB path");
  assert.equal(defaultConfig.contextIndexEnabled, true, "automatic context indexing should be enabled by default");
  updateCurrentClient({name: "Claude Desktop", version: "1.0.0"});
  defaultConfig = await configManager.getConfig();
  assert.equal(defaultConfig.contextIndexDbPath, "~/.claude/sqlite/fs-mcp.sqlite", "claude client should use the claude default context DB path");
  updateCurrentClient({name: "Cline", version: "1.0.0"});
  defaultConfig = await configManager.getConfig();
  assert.equal(defaultConfig.contextIndexDbPath, "~/.cline/sqlite/fs-mcp.sqlite", "cline client should use the cline default context DB path");
  await configManager.updateConfig({
    ...config,
    contextIndexDbPath: TEST_DB,
  });
}

async function runTests() {
  let originalState;
  try {
    originalState = await setup();
    await testExplicitIndexSearchListClear();
    await testAutomaticReadFileCompaction();
    await testDuplicateContextIndexReuse();
    await testDefaultDbPathConfig();
  }
  catch (error) {
    console.error("Test failed:", error.message);
    console.error(error.stack);
    return false;
  }
  finally {
    if (originalState !== undefined) {
      await teardown(originalState);
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
