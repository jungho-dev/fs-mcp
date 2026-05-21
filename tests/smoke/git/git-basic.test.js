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
import {dispatchToolCall as dsptTlCll} from "../../../out/tools/tools-dispatcher.js";

const excFlAsyn = promisify(execFile);

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.notEqual(result.isError, true);
  assert.equal(Array.isArray(result.content), true);
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);

  return result.structuredContent.data.structuredContent;
}

// 2. git fixture setup ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function setupRepository(repoPath) {
  await excFlAsyn("git", ["config", "user.name", "fs-mcp-test"], {cwd: repoPath, windowsHide: true});
  await excFlAsyn("git", ["config", "user.email", "fs-mcp@example.com"], {cwd: repoPath, windowsHide: true});
}

// 3. smoke flow ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testGitBasicFlow() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "fs-mcp-git-basic-"));
  const cmmtMsg2 = `feat: add demo file

- Add demo file fixture.
- Verify git smoke flow.`;

  try {
    const wrknDrOtpt = parseStandardOutput(await dsptTlCll("git_set_working_dir", {path: repoPath, initializeIfNotPresent: true}));
    assert.equal(wrknDrOtpt.success, true);

    await setupRepository(repoPath);

    const rfrWrDrOt = parseStandardOutput(await dsptTlCll("git_set_working_dir", {path: repoPath}));
    assert.equal(rfrWrDrOt.success, true);
    assert.equal(rfrWrDrOt.repository.status.branch, "main");

    const clnStatOtpt = parseStandardOutput(await dsptTlCll("git_status", {}));
    assert.equal(clnStatOtpt.success, true);
    assert.equal(clnStatOtpt.currentBranch, "main");
    assert.equal(clnStatOtpt.isClean, true);

    await fs.writeFile(path.join(repoPath, "demo.txt"), "hello git\n", "utf8");

    const addOutput = parseStandardOutput(await dsptTlCll("git_add", {paths: ["demo.txt"]}));
    assert.equal(addOutput.success, true);
    assert.equal(addOutput.stagedFiles.includes("demo.txt"), true);

    const commitOutput = parseStandardOutput(await dsptTlCll("git_commit", {message: cmmtMsg2}));
    assert.equal(commitOutput.success, true);
    assert.equal(commitOutput.message, "feat: add demo file");
    assert.equal(commitOutput.status.is_clean, true);

  }
  finally {
    await fs.rm(repoPath, {recursive: true, force: true});
  }
}

// 4. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  await testGitBasicFlow();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
