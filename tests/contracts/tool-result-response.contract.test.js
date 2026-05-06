import assert from "node:assert/strict";
import { createToolErrorResponse, createToolTextResponse, normalizeToolResult } from "../../out/cores/responses/responses-tool-result.js";

const HIDDEN_DISPLAY_TEXT = "";

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function assertHiddenDisplayText(result) {
  assert.equal(result.content[0].text, HIDDEN_DISPLAY_TEXT);
}

// 2. Parse standard output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  assertHiddenDisplayText(result);

  return result.structuredContent;
}

// 2. success envelope contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
}

// 3. error envelope contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
}

// 4. empty content fallback ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testEmptyContentFallback() {
  const normalized = normalizeToolResult("empty_tool", { content: [] }, 1);
  const output = parseStandardOutput(normalized);

  assert.deepEqual(output.data.content, [{ type: "text", text: "" }]);
  assert.equal(output.data.text, "");
  assert.equal(output.data.structuredContent, null);
  assert.deepEqual(normalized._meta.fsMcpResult.contentTypes, ["text"]);
}

// 5. duration shape without timing ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testDurationShapeWithoutTiming() {
  const result = createToolTextResponse("ok");
  const normalized = normalizeToolResult("no_duration_tool", result);
  const output = parseStandardOutput(normalized);

  assert.equal(output.durationMs, null);
  assert.equal(normalized._meta.fsMcpResult.durationMs, null);
}

// 6. normalized result hidden display contract ――――――――――――――――――――――――――――――――――――――――――――――――――――
function testNormalizedResultStillHidesDisplay() {
  const normalized = normalizeToolResult("already_normalized_tool", createToolTextResponse("visible data"), 2);
  normalized.content[0].text = "should not be shown";

  const renormalized = normalizeToolResult("already_normalized_tool", normalized, 3);
  const output = parseStandardOutput(renormalized);

  assert.equal(renormalized.content[0].text, HIDDEN_DISPLAY_TEXT);
  assert.equal(output.data.text, "visible data");
}

// 7. hidden display preserves structured data ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function testHiddenDisplayPreservesStructuredText() {
  const fullText = Array.from({ length: 6 }, (_value, index) => `line${index + 1} ${"x".repeat(320)}`).join("\n");
  const normalized = normalizeToolResult("preview_tool", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.equal(normalized.content[0].text, HIDDEN_DISPLAY_TEXT);
}

// 9. Test long text structured data preserved ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function testLongTextStructuredDataPreserved() {
  const fullText = Array.from({ length: 50 }, (_value, index) => `line${index + 1} ${"x".repeat(640)}`).join("\n");
  const normalized = normalizeToolResult("write_files", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.equal(normalized.content[0].text, HIDDEN_DISPLAY_TEXT);
}

// 10. Test existing summary preserved ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
  const output = parseStandardOutput(normalized);

  assert.equal(normalized.content[0].text, HIDDEN_DISPLAY_TEXT);
  assert.equal(output.data.text, batchText);
}

// 8. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testEmptyContentFallback();
  testDurationShapeWithoutTiming();
  testNormalizedResultStillHidesDisplay();
  testHiddenDisplayPreservesStructuredText();
  testLongTextStructuredDataPreserved();
  testExistingSummaryPreserved();
}

main();
