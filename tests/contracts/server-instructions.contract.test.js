/**
 * @file tests/contracts/server-instructions.contract.test.js
 * @description Server instruction contract tests.
 * @author JUNGHO
 * @since 2026-05-07
 */

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SERVER_INSTRUCTIONS as SRVR_INST} from "../../out/cores/server/server-instructions.js";

// 1. Server initialize instructions wiring ―――――――――――――――――――――――――――――――――――――――――――――――――――
function testServerInitializeInstructionsWiring() {
  const srvrCrtSrc = readFileSync(new URL("../../out/cores/server/server-create-mcp-server.js", import.meta.url), "utf8");

  assert.match(srvrCrtSrc, /server-instructions/);
  assert.ok((srvrCrtSrc.match(/instructions:/g) ?? []).length >= 2);
}

// 2. Test batch first guidance ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testBatchFirstGuidance() {
  assert.match(SRVR_INST, /Batch-first rule:/);
  assert.match(SRVR_INST, /instead of calling the same tool repeatedly/);
}

// 3. Test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testServerInitializeInstructionsWiring();
  testBatchFirstGuidance();
}

main();
