/**
 * @file tests/contracts/server-instructions.contract.test.js
 * @description Server instruction contract tests.
 * @author JUNGHO
 * @since 2026-05-07
 */

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SERVER_INSTRUCTIONS} from "../../out/cores/server/server-instructions.js";

// 1. Server initialize instructions wiring ―――――――――――――――――――――――――――――――――――――――――――――――――――
function testServerInitializeInstructionsWiring() {
  const serverCreateSource = readFileSync(new URL("../../out/cores/server/server-create-mcp-server.js", import.meta.url), "utf8");

  assert.match(serverCreateSource, /server-instructions/);
  assert.ok((serverCreateSource.match(/instructions:/g) ?? []).length >= 2);
}

// 2. Test batch first guidance ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testBatchFirstGuidance() {
  assert.match(SERVER_INSTRUCTIONS, /Batch-first rule:/);
  assert.match(SERVER_INSTRUCTIONS, /instead of calling the same tool repeatedly/);
}

// 3. Test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testServerInitializeInstructionsWiring();
  testBatchFirstGuidance();
}

main();
