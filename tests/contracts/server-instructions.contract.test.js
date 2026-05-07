/**
 * @file tests/contracts/server-instructions.contract.test.js
 * @description Server instruction contract tests.
 * @author JUNGHO
 * @since 2026-05-07
 */

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SERVER_INSTRUCTIONS} from "../../out/cores/server/server-instructions.js";

// 1. Caveman guidance contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testCavemanGuidanceContract() {
  assert.match(SERVER_INSTRUCTIONS, /Caveman mode supported/);
  assert.match(SERVER_INSTRUCTIONS, /terse, exact, and filler-free/);
  assert.match(SERVER_INSTRUCTIONS, /\[thing\] \[action\] \[reason\] \[next step\]/);
  assert.ok(SERVER_INSTRUCTIONS.length < 500);
}

// 2. Server initialize instructions wiring ―――――――――――――――――――――――――――――――――――――――――――――――――――
function testServerInitializeInstructionsWiring() {
  const serverCreateSource = readFileSync(new URL("../../out/cores/server/server-create-mcp-server.js", import.meta.url), "utf8");

  assert.match(serverCreateSource, /server-instructions/);
  assert.ok((serverCreateSource.match(/instructions:/g) ?? []).length >= 2);
}

// 3. Test runner ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testCavemanGuidanceContract();
  testServerInitializeInstructionsWiring();
}

main();
