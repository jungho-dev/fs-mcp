/**
 * @file tests/contracts/test-tool-routing-contract.js
 * @description Tool routing contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { dispatchToolCall, shouldRecordToolHistory } from "../../out/mcp/tools/tool-exports.mjs";

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");

  return JSON.parse(result.content[0].text);
}

function assertStandardToolResult(result, toolName, status) {
  const output = parseStandardOutput(result);

  assert.equal(result.isError, status === "error");
  assert.deepEqual(result.structuredContent, output);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.toolName, toolName);
  assert.equal(output.status, status);
  assert.equal(typeof output.durationMs, "number");
  assert.equal(typeof output.data.text, "string");
  assert.equal(Array.isArray(output.data.content), true);
  assert.equal(Object.hasOwn(output.data, "structuredContent"), true);

  return output;
}

// 2. history policy contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testHistoryPolicy() {
  assert.equal(shouldRecordToolHistory("read_file"), true);
  assert.equal(shouldRecordToolHistory("get_recent_tool_calls"), false);
}

// 3. unknown tool contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testUnknownToolResponse() {
  const result = await dispatchToolCall("missing_tool_for_contract_test", {});
  const output = assertStandardToolResult(result, "missing_tool_for_contract_test", "error");

  assert.match(output.error.message, /Unknown tool: missing_tool_for_contract_test/);
  assert.match(output.data.text, /Unknown tool: missing_tool_for_contract_test/);
}

// 4. dispatcher output contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testDispatcherNormalizesKnownToolResponse() {
  const result = await dispatchToolCall("get_recent_tool_calls", { maxResults: 1 });
  const output = assertStandardToolResult(result, "get_recent_tool_calls", "success");

  assert.equal(output.error, null);
  assert.match(output.data.text, /Tool Call History/);
}

// 5. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  testHistoryPolicy();
  await testUnknownToolResponse();
  await testDispatcherNormalizesKnownToolResponse();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
