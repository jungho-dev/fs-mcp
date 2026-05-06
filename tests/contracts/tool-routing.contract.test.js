/**
 * @file tests/contracts/tool-routing.contract.test.js
 * @description Tool routing contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { normalizeToolResult } from "../../out/cores/responses/responses-tool-result.js";
import { dispatchToolCall, getDispatchableToolNames } from "../../out/tools/tools-dispatcher.js";

const HIDDEN_DISPLAY_TEXT = "";
const UNKNOWN_TOOL_PATTERN = /Unknown tool: missing_tool_for_contract_test/;

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(result.content[0].text, HIDDEN_DISPLAY_TEXT);
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
  const result = await dispatchToolCall("missing_tool_for_contract_test", {});
  const output = assertStandardToolResult(result, "missing_tool_for_contract_test", "error");

  assert.match(output.error.message, UNKNOWN_TOOL_PATTERN);
  assert.match(output.data.text, UNKNOWN_TOOL_PATTERN);
}

// 3. dispatcher output contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testDispatcherNormalizesKnownToolResponse() {
  const result = await dispatchToolCall("get_configs", {
    items: [
      { key: "version" },
      { key: "defaultShell" },
    ],
  });
  const output = assertStandardToolResult(result, "get_configs", "success");

  assert.equal(output.error, null);
  assert.equal(output.data.structuredContent.totalCount, 2);
  assert.equal(output.data.structuredContent.succeededCount, 2);
}

// 4. hidden display data preservation ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testHiddenDisplayPreservesStructuredData() {
  const longText = Array.from({ length: 20 }, (_value, index) => `synthetic output line ${index} ${"x".repeat(80)}`).join("\n");
  const result = normalizeToolResult("synthetic_tool", {
    content: [{ type: "text", text: longText }],
  }, 1);
  const output = assertStandardToolResult(result, "synthetic_tool", "success");

  assert.equal(result.content[0].text, HIDDEN_DISPLAY_TEXT);
  assert.equal(output.data.text, longText);
}

// 6. Test get configs supports default batch ――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testGetConfigsSupportsDefaultBatch() {
  const result = await dispatchToolCall("get_configs", {});
  const output = assertStandardToolResult(result, "get_configs", "success");

  assert.equal(output.error, null);
  assert.ok(output.data.structuredContent.totalCount > 2);
}

// 7. Test every dispatchable tool hides display text ――――――――――――――――――――――――――――――――――――――――――――――
async function testEveryDispatchableToolHidesDisplayText() {
  for (const toolName of getDispatchableToolNames()) {
    // Invalid args keep the check side-effect-light while still proving dispatcher normalization.
    // No-arg tools may run normally; they are read-only listings.
    // biome-ignore lint/performance/noAwaitInLoops: Tool names are checked sequentially to avoid process/git state races.
    const result = await dispatchToolCall(toolName, { __contractInvalid: true });

    assert.equal(result.content.length, 1, toolName);
    assert.equal(result.content[0].type, "text", toolName);
    assert.equal(typeof result.content[0].text, "string", toolName);
    assert.equal(result.content[0].text, HIDDEN_DISPLAY_TEXT, toolName);
  }
}

// 5. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  await testUnknownToolResponse();
  await testDispatcherNormalizesKnownToolResponse();
  testHiddenDisplayPreservesStructuredData();
  await testGetConfigsSupportsDefaultBatch();
  await testEveryDispatchableToolHidesDisplayText();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
