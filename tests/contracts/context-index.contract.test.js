import assert from "node:assert/strict";
import {Database} from "bun:sqlite";
import {existsSync, mkdtempSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {configManager as cfgMgr} from "../../out/features/config/config-store.js";
import {contextIndexService as ctxIdxSvc} from "../../out/features/context/context-index-service.js";
import {dispatchToolCall as dsptTlCll} from "../../out/tools/tools-dispatcher.js";

// 1. Parse standard output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);

  return result.structuredContent;
}

// 1-1. Extract batch results ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractBatchResults(result) {
  const output = parseStandardOutput(result);

  return output.data.structuredContent.results;
}

// 2. Remove temp directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function removeTempDir(dir) {
  for (const delay of [50, 100, 200, 400, 800]) {
    try {
      await new Promise((resolve) => setTimeout(resolve, delay));
      await rm(dir, {force: true, recursive: true});
      return;
    }
    catch (error) {
      if (error?.code !== "EBUSY") {
        throw error;
      }
    }
  }
  await rm(dir, {force: true, recursive: true});
}

// 3. Create isolated context config ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function useIsolatedContextConfig(dir, overrides = {}) {
  await cfgMgr.updateConfig({
    allowedDirectories: [dir],
    contextIndexAutoMinChars: 0,
    contextIndexAutoMinLines: 0,
    contextIndexDbPath: join(dir, "fs-mcp.sqlite"),
    contextIndexEnabled: true,
    contextIndexMaxBytes: 1_000_000,
    contextIndexMaxDocuments: 100,
    contextIndexMaxEntryChars: 10,
    contextIndexReplaceLargeOutputs: false,
    ...overrides,
  });
}

// 3. Read database snapshot ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function readDbSnapshot(dbPath) {
  const db = new Database(dbPath, {readonly: true});

  try {
    return {
      chunkCount: db.query("SELECT COUNT(*) AS count FROM context_chunks").get().count,
      columns: db.query("PRAGMA table_info(context_documents)").all().map((row) => row.name),
      ftsCount: db.query("SELECT COUNT(*) AS count FROM context_chunks_fts").get().count,
      userVersion: db.query("PRAGMA user_version").get().user_version,
    };
  }
  finally {
    db.close();
  }
}

// 4. Full hash separates same-prefix payloads ―――――――――――――――――――――――――――――――――――――――――――――――
async function testFullHashSeparatesSamePrefixPayloads() {
  const dir = mkdtempSync(join(tmpdir(), "fs-mcp-context-hash-"));
  const dbPath = join(dir, "fs-mcp.sqlite");

  try {
    await useIsolatedContextConfig(dir);
    const first = ctxIdxSvc.indexText("same-source", "abcdefghij-FIRST-LONG-BODY", "hash_tool");
    const second = ctxIdxSvc.indexText("same-source", "abcdefghij-SECOND-DIFFERENT-LONGER-BODY", "hash_tool");
    const docs = ctxIdxSvc.listDocuments();
    const snapshot = readDbSnapshot(dbPath);

    assert.notEqual(first.indexId, second.indexId);
    assert.equal(first.indexedLength, 10);
    assert.equal(first.truncated, true);
    assert.equal(second.indexedLength, 10);
    assert.equal(second.truncated, true);
    assert.equal(docs.length, 2);
    assert.ok(snapshot.userVersion >= 3);
    assert.equal(snapshot.columns.includes("indexed_length"), true);
    assert.equal(snapshot.columns.includes("original_bytes"), true);
    assert.equal(snapshot.columns.includes("truncated"), true);
    assert.equal(snapshot.chunkCount, 2);
    assert.equal(snapshot.ftsCount, 2);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(dir);
  }
}

// 5. Retention deletes old indexed documents ―――――――――――――――――――――――――――――――――――――――――――――――――
async function testRetentionDeletesOldDocuments() {
  const dir = mkdtempSync(join(tmpdir(), "fs-mcp-context-retention-"));
  const dbPath = join(dir, "fs-mcp.sqlite");

  try {
    await useIsolatedContextConfig(dir, {
      contextIndexMaxBytes: 1_000_000,
      contextIndexMaxDocuments: 2,
      contextIndexMaxEntryChars: 1_000,
    });
    const first = ctxIdxSvc.indexText("retention-1", "old_unique_token alpha", "retention_tool");

    ctxIdxSvc.indexText("retention-2", "middle_unique_token beta", "retention_tool");
    ctxIdxSvc.indexText("retention-3", "new_unique_token gamma", "retention_tool");

    const docs = ctxIdxSvc.listDocuments();
    const snapshot = readDbSnapshot(dbPath);

    assert.equal(docs.length, 2);
    assert.equal(docs.some((doc) => doc.indexId === first.indexId), false);
    assert.equal(ctxIdxSvc.search("old_unique_token", 5).length, 0);
    assert.equal(snapshot.chunkCount, 2);
    assert.equal(snapshot.ftsCount, 2);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(dir);
  }
}

// 6. Retention uses UTF-8 bytes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testRetentionUsesUtf8Bytes() {
  const dir = mkdtempSync(join(tmpdir(), "fs-mcp-context-bytes-"));

  try {
    await useIsolatedContextConfig(dir, {
      contextIndexMaxBytes: 5,
      contextIndexMaxDocuments: 100,
      contextIndexMaxEntryChars: 1_000,
    });
    const oldRef = ctxIdxSvc.indexText("byte-old", "abc", "byte_tool");
    const newRef = ctxIdxSvc.indexText("byte-new", "가나", "byte_tool");
    const docs = ctxIdxSvc.listDocuments();

    assert.equal(docs.length, 1);
    assert.equal(docs[0].indexId, newRef.indexId);
    assert.equal(docs[0].originalBytes, 6);
    assert.equal(docs.some((doc) => doc.indexId === oldRef.indexId), false);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(dir);
  }
}

// 7. Zero document retention keeps latest reference ―――――――――――――――――――――――――――――――――――――――――
async function testZeroDocumentRetentionKeepsLatestReference() {
  const dir = mkdtempSync(join(tmpdir(), "fs-mcp-context-zero-"));

  try {
    await useIsolatedContextConfig(dir, {
      contextIndexMaxDocuments: 0,
      contextIndexMaxEntryChars: 1_000,
    });
    const reference = ctxIdxSvc.indexText("zero-source", "zero_unique_token", "zero_tool");
    const docs = ctxIdxSvc.listDocuments();

    assert.equal(docs.length, 1);
    assert.equal(docs[0].indexId, reference.indexId);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(dir);
  }
}

// 8. Config batch validates against projected config ―――――――――――――――――――――――――――――――――――――――――
async function testSetConfigValuesUsesProjectedConfig() {
  const dir = mkdtempSync(join(tmpdir(), "fs-mcp-context-config-"));
  const dbPath = join(dir, "fs-mcp.sqlite");

  try {
    await cfgMgr.updateConfig({
      allowedDirectories: [],
      contextIndexDbPath: undefined,
    });
    const results = extractBatchResults(await dsptTlCll("set_config_values", {
      items: [
        {
          key: "contextIndexDbPath",
          value: dbPath,
        },
        {
          key: "allowedDirectories",
          value: [dir],
        },
      ],
    }));
    const config = await cfgMgr.getConfig();

    assert.equal(results.length, 2);
    assert.equal(results.every((item) => item.ok === true), true);
    assert.deepEqual(config.allowedDirectories, [dir]);
    assert.equal(config.contextIndexDbPath, dbPath);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(dir);
  }
}

// 9. Context index tools expose maintenance surface ―――――――――――――――――――――――――――――――――――――――――
async function testContextIndexToolsExposeMaintenanceSurface() {
  const dir = mkdtempSync(join(tmpdir(), "fs-mcp-context-tools-"));

  try {
    await useIsolatedContextConfig(dir, {
      contextIndexAutoMinChars: 100_000,
      contextIndexAutoMinLines: 100_000,
      contextIndexMaxEntryChars: 1_000,
    });
    const reference = ctxIdxSvc.indexText("tool-source", "needle_context_value line", "tool_surface");
    const listOutput = parseStandardOutput(await dsptTlCll("list_context_index", {limit: 10}));
    const searchOutput = parseStandardOutput(await dsptTlCll("search_context_index", {query: "needle_context_value", limit: 5}));
    const clearOutput = parseStandardOutput(await dsptTlCll("clear_context_index", {source: "tool-source"}));

    assert.equal(listOutput.status, "success");
    assert.equal(listOutput.data.structuredContent.documents.some((doc) => doc.indexId === reference.indexId), true);
    assert.equal(searchOutput.data.structuredContent.results.length, 1);
    assert.equal(clearOutput.data.structuredContent.deletedCount, 1);
    assert.equal(ctxIdxSvc.listDocuments().length, 0);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(dir);
  }
}

// 10. Custom DB path must stay in allowed context roots ―――――――――――――――――――――――――――――――――――――――
async function testCustomDbPathMustStayAllowed() {
  const allowedDir = mkdtempSync(join(tmpdir(), "fs-mcp-context-allowed-"));
  const blockedDir = mkdtempSync(join(tmpdir(), "fs-mcp-context-blocked-"));
  const blckDbPth = join(blockedDir, "fs-mcp.sqlite");

  try {
    await useIsolatedContextConfig(allowedDir, {
      contextIndexDbPath: blckDbPth,
    });
    assert.throws(() => ctxIdxSvc.indexText("blocked-source", "blocked content", "path_tool"), /contextIndexDbPath/);
    assert.equal(existsSync(blckDbPth), false);
  }
  finally {
    ctxIdxSvc.close();
    await removeTempDir(allowedDir);
    await removeTempDir(blockedDir);
  }
}

// 8. Main ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const origCfg = await cfgMgr.getConfig();

  try {
    await testFullHashSeparatesSamePrefixPayloads();
    await testRetentionDeletesOldDocuments();
    await testRetentionUsesUtf8Bytes();
    await testZeroDocumentRetentionKeepsLatestReference();
    await testSetConfigValuesUsesProjectedConfig();
    await testContextIndexToolsExposeMaintenanceSurface();
    await testCustomDbPathMustStayAllowed();
  }
  finally {
    ctxIdxSvc.close();
    await cfgMgr.updateConfig(origCfg);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
