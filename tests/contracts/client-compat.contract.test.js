/**
 * @file tests/contracts/client-compat.contract.test.js
 * @description Client compatibility profile contract tests.
 * @author JUNGHO
 * @since 2026-05-18
 */

import assert from "node:assert/strict";
import { detectAgentId as dtctAgntId, shouldDisableNotifications as shldDsblNtfc } from "../../out/cores/transport/transport-stdio-transport.js";

// 1. Test representative agent detection -------------------------------------------------------
function testAgentDetection() {
  assert.equal(dtctAgntId("Claude Desktop"), "claude");
  assert.equal(dtctAgntId("codex-cli"), "codex");
  assert.equal(dtctAgntId("Gemini CLI"), "gemini");
  assert.equal(dtctAgntId("GitHub Copilot"), "copilot");
  assert.equal(dtctAgntId("Visual Studio Code"), "unknown");
}

// 2. Test notification policy --------------------------------------------------------------------
function testNotificationPolicy() {
  assert.equal(shldDsblNtfc("Claude Desktop"), false);
  assert.equal(shldDsblNtfc("codex-cli"), false);
  assert.equal(shldDsblNtfc("Gemini CLI"), true);
  assert.equal(shldDsblNtfc("GitHub Copilot"), true);
  assert.equal(shldDsblNtfc("Cline"), false);
  assert.equal(shldDsblNtfc("Visual Studio Code"), false);
}

// 3. Main -----------------------------------------------------------------------------------------
function main() {
  testAgentDetection();
  testNotificationPolicy();
}

main();
