import assert from "node:assert/strict";
import { createToolErrorResponse, createToolTextResponse, normalizeToolResult } from "../../out/cores/responses/responses-tool-result.mjs";

// 1. standard output parser ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  assert.ok(result.content[0].text.split(/\r?\n/).length <= 5);

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
  assert.match(normalized.content[0].text, /contract_tool \| success \| 7ms/);
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
  assert.match(normalized.content[0].text, /error_tool \| error \| 3ms/);
}

// 4. empty content fallback ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testEmptyContentFallback() {
  const normalized = normalizeToolResult("empty_tool", { content: [] }, 1);
  const output = parseStandardOutput(normalized);

  assert.deepEqual(output.data.content, [{ type: "text", text: "" }]);
  assert.equal(output.data.text, "");
  assert.equal(output.data.structuredContent, null);
  assert.deepEqual(normalized._meta.fsMcpResult.contentTypes, ["text"]);
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
  const fullText = ["line1", "line2", "line3", "line4", "line5", "line6"].join("\n");
  const normalized = normalizeToolResult("preview_tool", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);
  const displayLines = normalized.content[0].text.split(/\r?\n/);

  assert.equal(output.data.text, fullText);
  assert.ok(displayLines.length <= 5);
  assert.match(displayLines[0], /preview_tool \| success \| 9ms/);
  assert.match(displayLines[displayLines.length - 1], /structuredContent/);
}

// 7. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testEmptyContentFallback();
  testDurationShapeWithoutTiming();
  testDisplayPreviewContract();
}

main();
