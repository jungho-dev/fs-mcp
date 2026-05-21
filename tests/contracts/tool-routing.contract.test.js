/**
 * @file tests/contracts/tool-routing.contract.test.js
 * @description Tool routing contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { createToolDisplayText as crtTlDsplTxt } from "../../out/cores/responses/responses-tool-display.js";
import { normalizeToolResult as nrmlTlRes } from "../../out/cores/responses/responses-tool-result.js";
import { dispatchToolCall as dsptTlCll, getDispatchableToolNames as gtDsptTlNms } from "../../out/tools/tools-dispatcher.js";

const UNKN_TL_PAT = /Unknown tool: missing_tool_for_contract_test/;
// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);

  return result.structuredContent;
}

// 2. Assert standard tool result ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function assertStandardToolResult(result, toolName, status) {
  const output = parseStandardOutput(result);

  assert.equal(result.isError, status === "error");
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.toolName, toolName);
  assert.equal(output.status, status);
  assert.equal(typeof output.durationMs, "number");
  assert.equal(typeof output.data.text, "string");
  assert.equal(Array.isArray(output.data.content), true);
  assert.equal(Object.hasOwn(output.data, "structuredContent"), true);

  return output;
}

// 2. unknown tool contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testUnknownToolResponse() {
  const result = await dsptTlCll("missing_tool_for_contract_test", {});
  const output = assertStandardToolResult(result, "missing_tool_for_contract_test", "error");

  assert.match(output.error.message, UNKN_TL_PAT);
  assert.match(output.data.text, UNKN_TL_PAT);
  assert.equal(result.content[0].text, crtTlDsplTxt(output));
  assert.doesNotMatch(result.content[0].text, UNKN_TL_PAT);
}

// 3. dispatcher output contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testDispatcherNormalizesKnownToolResponse() {
  const result = await dsptTlCll("git-status", {
    path: process.cwd(),
  });
  const output = assertStandardToolResult(result, "git-status", "success");

  assert.equal(output.error, null);
  assert.equal(result.content[0].text, crtTlDsplTxt(output));
  assert.doesNotMatch(result.content[0].text, /succeeded/);
  assert.equal(output.data.structuredContent.success, true);
}

// 4. display data preservation ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testDisplayPreservesStructuredData() {
  const longText = Array.from({ length: 20 }, (_value, index) => `synthetic output line ${index} ${"x".repeat(80)}`).join("\n");
  const result = nrmlTlRes("synthetic_tool", {
    content: [{ type: "text", text: longText }],
  }, 1);
  const output = assertStandardToolResult(result, "synthetic_tool", "success");

  assert.equal(result.content[0].text, crtTlDsplTxt(output));
  assert.doesNotMatch(result.content[0].text, /synthetic output line/);
  assert.equal(output.data.text, longText);
}

// 7. Test every dispatchable tool returns display text ―――――――――――――――――――――――――――――――――――――――――
async function testEveryDispatchableToolReturnsDisplayText() {
  for (const toolName of gtDsptTlNms()) {
    // Invalid args keep the check side-effect-light while still proving dispatcher normalization.
    // No-arg tools may run normally; they are read-only listings.
    // biome-ignore lint/performance/noAwaitInLoops: Tool names are checked sequentially to avoid process/git state races.
    const result = await dsptTlCll(toolName, { __contractInvalid: true });

    assert.equal(result.content.length, 1, toolName);
    assert.equal(result.content[0].type, "text", toolName);
    assert.equal(typeof result.content[0].text, "string", toolName);
    assert.ok(result.content[0].text.length > 0, toolName);
  }
}

// 5. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  await testUnknownToolResponse();
  await testDispatcherNormalizesKnownToolResponse();
  testDisplayPreservesStructuredData();
  await testEveryDispatchableToolReturnsDisplayText();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
