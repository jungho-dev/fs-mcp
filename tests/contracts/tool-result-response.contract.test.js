import assert from "node:assert/strict";
import { createToolErrorResponse, createToolTextResponse, normalizeToolResult } from "../../out/cores/responses/responses-tool-result.js";

const DISPLAY_MAX_LINES = 5;
const DISPLAY_MAX_LINE_LENGTH = 30;
const DISPLAY_MAX_CHARS = 30;
const DISPLAY_LINE_SPLIT_PATTERN = /\r?\n/;
const TRUNCATED_PATTERN = /truncated/;

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function assertDisplayPreview(result) {
  assert.ok(result.content[0].text.length <= DISPLAY_MAX_CHARS);

  const displayLines = result.content[0].text.split(DISPLAY_LINE_SPLIT_PATTERN);

  assert.ok(displayLines.length <= DISPLAY_MAX_LINES);
  for (const displayLine of displayLines) {
    assert.ok(displayLine.length <= DISPLAY_MAX_LINE_LENGTH);
  }
  return displayLines;
}
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  assertDisplayPreview(result);

  return result.structuredContent;
}

// 2. success envelope contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testSuccessEnvelope() {
  const result = createToolTextResponse("ok", {
    structuredContent: { value: 42 },
    meta: { requestId: "contract-success" },
  });
  const normalized = normalizeToolResult("contract_tool", result, 7);
  const output = parseStandardOutput(normalized);

  assert.equal(output.schemaVersion, 1);
  assert.equal(output.toolName, "contract_tool");
  assert.equal(output.status, "success");
  assert.equal(output.durationMs, 7);
  assert.equal(output.error, null);
  assert.equal(output.data.text, "ok");
  assert.deepEqual(output.data.content, [{ type: "text", text: "ok" }]);
  assert.deepEqual(output.data.structuredContent, { value: 42 });
  assert.equal(normalized.structuredContent.toolName, "contract_tool");
  assert.equal(normalized._meta.requestId, "contract-success");
  assert.equal(normalized._meta.fsMcpResult.status, "success");
  assert.equal(normalized._meta.fsMcpResult.durationMs, 7);
  assert.equal(normalized._meta.fsMcpResult.errorMessage, null);
  assert.ok(normalized.content[0].text.length <= DISPLAY_MAX_CHARS);
}

// 3. error envelope contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testErrorEnvelope() {
  const result = createToolErrorResponse("boom");
  const normalized = normalizeToolResult("error_tool", result, 3);
  const output = parseStandardOutput(normalized);

  assert.equal(normalized.isError, true);
  assert.equal(output.status, "error");
  assert.deepEqual(output.error, { message: "Error: boom" });
  assert.equal(output.data.text, "Error: boom");
  assert.equal(output.data.content[0].text, "Error: boom");
  assert.equal(normalized._meta.fsMcpResult.status, "error");
  assert.equal(normalized._meta.fsMcpResult.errorMessage, "Error: boom");
  assert.ok(normalized.content[0].text.length <= DISPLAY_MAX_CHARS);
}

// 4. empty content fallback ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testEmptyContentFallback() {
  const normalized = normalizeToolResult("empty_tool", { content: [] }, 1);
  const output = parseStandardOutput(normalized);

  assert.deepEqual(output.data.content, [{ type: "text", text: "" }]);
  assert.equal(output.data.text, "");
  assert.equal(output.data.structuredContent, null);
  assert.deepEqual(normalized._meta.fsMcpResult.contentTypes, ["text"]);
  assert.ok(normalized.content[0].text.length <= DISPLAY_MAX_CHARS);
}

// 5. duration shape without timing ――――――――――――――――――――――――――――――――――――――――――――――――――
function testDurationShapeWithoutTiming() {
  const result = createToolTextResponse("ok");
  const normalized = normalizeToolResult("no_duration_tool", result);
  const output = parseStandardOutput(normalized);

  assert.equal(output.durationMs, null);
  assert.equal(normalized._meta.fsMcpResult.durationMs, null);
}

// 6. display preview contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testDisplayPreviewContract() {
  const fullText = Array.from({ length: 6 }, (_value, index) => `line${index + 1} ${"x".repeat(DISPLAY_MAX_LINE_LENGTH * 2)}`).join("\n");
  const normalized = normalizeToolResult("preview_tool", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);
  const displayLines = assertDisplayPreview(normalized);

  assert.equal(output.data.text, fullText);
  assert.ok(displayLines[0].length <= DISPLAY_MAX_CHARS);
  assert.match(displayLines.at(-1), TRUNCATED_PATTERN);
}
function testDisplayCharacterLimitContract() {
  const fullText = Array.from({ length: 50 }, (_value, index) => `line${index + 1} ${"x".repeat(DISPLAY_MAX_LINE_LENGTH * 4)}`).join("\n");
  const normalized = normalizeToolResult("write_files", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.ok(normalized.content[0].text.length <= DISPLAY_MAX_CHARS);
  assert.match(normalized.content[0].text, TRUNCATED_PATTERN);
}
function testExistingSummaryPreserved() {
  const batchText = [
    "batch_tool: 4/4 succeeded",
    "",
    "[1] OK alpha",
    "[2] OK beta",
    "[3] OK gamma",
    "[4] OK delta",
  ].join("\n");
  const normalized = normalizeToolResult("batch_tool", createToolTextResponse(batchText), 5);
  const displayLines = assertDisplayPreview(normalized);

  assert.equal(displayLines[0].length <= DISPLAY_MAX_CHARS, true);
  assert.match(displayLines.at(-1), TRUNCATED_PATTERN);
}

// 7. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testEmptyContentFallback();
  testDurationShapeWithoutTiming();
  testDisplayPreviewContract();
  testDisplayCharacterLimitContract();
  testExistingSummaryPreserved();
}

main();
