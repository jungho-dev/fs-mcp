/**
 * @file tests/smoke/git/git-basic.test.js
 * @description Git tool smoke tests.
 * @author JUNGHO
 * @since 2026-05-03
 */

import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import {dispatchToolCall} from "../../../out/tools/tools-dispatcher.js";

const execFileAsync = promisify(execFile);

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.notEqual(result.isError, true);
  assert.equal(Array.isArray(result.content), true);
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);

  return result.structuredContent.data.structuredContent;
}

// 2. git fixture setup ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function setupRepository(repoPath) {
  await execFileAsync("git", ["config", "user.name", "fs-mcp-test"], {cwd: repoPath, windowsHide: true});
  await execFileAsync("git", ["config", "user.email", "fs-mcp@example.com"], {cwd: repoPath, windowsHide: true});
}

// 3. smoke flow ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testGitBasicFlow() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "fs-mcp-git-basic-"));

  try {
    const initOutput = parseStandardOutput(await dispatchToolCall("git_init", {path: repoPath, initialBranch: "main"}));
    assert.equal(initOutput.success, true);

    await setupRepository(repoPath);

    const workingDirOutput = parseStandardOutput(await dispatchToolCall("git_set_working_dir", {path: repoPath}));
    assert.equal(workingDirOutput.success, true);
    assert.equal(workingDirOutput.repository.status.branch, "main");

    const cleanStatusOutput = parseStandardOutput(await dispatchToolCall("git_status", {}));
    assert.equal(cleanStatusOutput.success, true);
    assert.equal(cleanStatusOutput.currentBranch, "main");
    assert.equal(cleanStatusOutput.isClean, true);

    await fs.writeFile(path.join(repoPath, "demo.txt"), "hello git\n", "utf8");

    const addOutput = parseStandardOutput(await dispatchToolCall("git_add", {paths: ["demo.txt"]}));
    assert.equal(addOutput.success, true);
    assert.equal(addOutput.stagedFiles.includes("demo.txt"), true);

    const commitOutput = parseStandardOutput(await dispatchToolCall("git_commit", {message: "feat: add demo file"}));
    assert.equal(commitOutput.success, true);
    assert.equal(commitOutput.message, "feat: add demo file");
    assert.equal(commitOutput.status.is_clean, true);

    const logOutput = parseStandardOutput(await dispatchToolCall("git_log", {maxCount: 1}));
    assert.equal(logOutput.success, true);
    assert.equal(logOutput.totalCount, 1);
    assert.equal(logOutput.commits[0].subject, "feat: add demo file");
  } finally {
    await fs.rm(repoPath, {recursive: true, force: true});
  }
}

// 4. test runner ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  await testGitBasicFlow();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
