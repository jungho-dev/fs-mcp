/**
 * @file tests/smoke/inspect/fs-inspect-basic.test.js
 * @description fs-inspect smoke tests for count-files, search, json-pick, snippet, and budget.
 * @author JUNGHO
 * @since 2026-06-03
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";
import { dispatchToolCall as dsptTlCll } from "../../../out/tools/tools-dispatcher.js";

const TEST_DIR = path.join(os.tmpdir(), "fs-mcp-fs-inspect-smoke");
const SRC_DIR = path.join(TEST_DIR, "src");
const TXT_FILE = path.join(SRC_DIR, "a.txt");
const MD_FILE = path.join(SRC_DIR, "b.md");
const JSON_FILE = path.join(TEST_DIR, "data.json");

// 1. Extract inspect payload ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractInspectPayload(result) {
  const output = result.structuredContent;

  assert.equal(typeof output, "object");
  assert.notEqual(output, null);
  return output.data.structuredContent;
}

// 2. Setup ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function setup() {
  const origCfg = await cfgMgr.getConfig();

  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(SRC_DIR, { recursive: true });
  await fs.writeFile(TXT_FILE, "alpha line\nTODO: fix me\nlast line\n", "utf8");
  await fs.writeFile(MD_FILE, "# heading\nbody text\n", "utf8");
  await fs.writeFile(JSON_FILE, JSON.stringify({ name: "demo", nested: { value: 42 } }), "utf8");
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

// 4. Composite request answers ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testCompositeRequestAnswers() {
  const result = await dsptTlCll("fs-inspect", {
    root: TEST_DIR,
    requests: [
      { id: "count", op: "count-files", path: "src", glob: "*.txt", recursive: true },
      { id: "find", op: "search", path: "src", pattern: "TODO: (\\w+)", extract: [{ name: "word", regex: "TODO: (\\w+)" }] },
      { id: "pick", op: "json-pick", path: "data.json", pointers: ["/name", "/nested/value", "/missing"] },
      { id: "snip", op: "snippet", path: "src/a.txt", patterns: ["TODO"], contextLines: 1 },
    ],
  });
  const payload = extractInspectPayload(result);
  const answers = payload.answers;

  assert.equal(result.isError, false);
  assert.equal(payload.status, "partial");
  assert.equal(answers.length, 4);

  const countAnswer = answers.find((answer) => answer.id === "count");
  assert.equal(countAnswer.status, "ok");
  assert.equal(countAnswer.value.count, 1);
  assert.equal(countAnswer.value.glob, "*.txt");

  const findAnswer = answers.find((answer) => answer.id === "find");
  assert.equal(findAnswer.status, "ok");
  assert.equal(findAnswer.value.matches, 1);
  assert.equal(findAnswer.value.word, "fix");
  assert.equal(findAnswer.evidence[0].lineStart, 2);

  const pickAnswer = answers.find((answer) => answer.id === "pick");
  assert.equal(pickAnswer.status, "partial");
  assert.equal(pickAnswer.value.values["/name"], "demo");
  assert.equal(pickAnswer.value.values["/nested/value"], 42);
  assert.match(pickAnswer.warnings[0], /missing pointer/);

  const snipAnswer = answers.find((answer) => answer.id === "snip");
  assert.equal(snipAnswer.status, "ok");
  assert.equal(snipAnswer.value.matches, 1);
  assert.equal(snipAnswer.value.ranges[0].lineStart, 1);
  assert.match(snipAnswer.evidence[0].snippet, /2: TODO: fix me/);

  assert.equal(payload.metrics.scannedFiles > 0, true);
  assert.equal(payload.metrics.truncated, false);
}

// 5. Snippet budget truncates evidence ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testSnippetBudgetTruncates() {
  const result = await dsptTlCll("fs-inspect", {
    root: TEST_DIR,
    maxSnippetChars: 8,
    requests: [
      { id: "snip", op: "snippet", path: "src/a.txt", patterns: ["line"], contextLines: 0 },
    ],
  });
  const payload = extractInspectPayload(result);

  assert.equal(payload.metrics.truncated, true);
  assert.equal(payload.metrics.snippetChars <= 8, true);
}

// 6. Unknown root rejected ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testUnknownRootRejected() {
  const result = await dsptTlCll("fs-inspect", {
    root: path.join(TEST_DIR, "does-not-exist"),
    requests: [{ op: "count-files", path: "." }],
  });

  assert.equal(result.isError, true);
}

// 7. Git status answer resolves ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// TEST_DIR is not a git repository, so the answer must be a per-request error while the call
// itself still succeeds with a normal envelope.
async function testGitStatusAnswerResolves() {
  const result = await dsptTlCll("fs-inspect", {
    root: TEST_DIR,
    requests: [
      { id: "git", op: "git-status", path: TEST_DIR },
      { id: "count", op: "count-files", path: "src" },
    ],
  });
  const payload = extractInspectPayload(result);
  const gitAnswer = payload.answers.find((answer) => answer.id === "git");

  assert.equal(result.isError, false);
  assert.equal(gitAnswer.op, "git-status");
  assert.equal(["ok", "error"].includes(gitAnswer.status), true);
}

// 8. Main ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const origCfg = await setup();

  try {
    await testCompositeRequestAnswers();
    await testSnippetBudgetTruncates();
    await testUnknownRootRejected();
    await testGitStatusAnswerResolves();
  }
  finally {
    await teardown(origCfg);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
