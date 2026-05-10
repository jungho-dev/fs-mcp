/**
 * @file tests/contracts/server-instructions.contract.test.js
 * @description Server instruction contract tests.
 * @author JUNGHO
 * @since 2026-05-07
 */

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// 1. Server initialize instructions wiring ―――――――――――――――――――――――――――――――――――――――――――――――――――
function testServerInitializeInstructionsWiring() {
  const serverCreateSource = readFileSync(new URL("../../out/cores/server/server-create-mcp-server.js", import.meta.url), "utf8");

  assert.match(serverCreateSource, /server-instructions/);
  assert.ok((serverCreateSource.match(/instructions:/g) ?? []).length >= 2);
}

// 2. Test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testServerInitializeInstructionsWiring();
}

main();
