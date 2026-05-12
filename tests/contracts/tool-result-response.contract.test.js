import assert from "node:assert/strict";
import { createToolDisplayText } from "../../out/cores/responses/responses-tool-display.js";
import { createToolErrorResponse, createToolTextResponse, normalizeToolResult } from "../../out/cores/responses/responses-tool-result.js";
import { configManager } from "../../out/features/config/config-store.js";
import { contextIndexService } from "../../out/features/context/context-index-service.js";

// 2. Parse standard output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);

  return result.structuredContent;
}

function createExpectedDisplaySummary(toolName, status, text, structuredContent, contentItems = 1) {
  return createToolDisplayText({
    data: {
      content: Array.from({ length: contentItems }, () => ({ text: "", type: "text" })),
      structuredContent,
      text,
    },
    status,
    toolName,
  });
}

function testTemplateLiteralDisplayFormat() {
  const normalized = normalizeToolResult("template_tool", createToolTextResponse("ok"), 1);
  const output = parseStandardOutput(normalized);
  const missingPlaceholder = `${"$"}{missing}`;

  assert.equal(createToolDisplayText(output, `name=\${toolName}; result=\${status}; bytes=\${textChars}`), "name=template_tool; result=success; bytes=2");
  assert.equal(createToolDisplayText(output, `unknown=${missingPlaceholder}`), `unknown=${missingPlaceholder}`);
}

function testDisplayCountsBatchStructuredItems() {
  assert.equal(createToolDisplayText({
    data: {
      content: [{ text: "", type: "text" }],
      structuredContent: { results: [{}, {}], totalCount: 2 },
      text: "",
    },
    status: "success",
    toolName: "batch_tool",
  }, `items=\${items}`), "items=2");
  assert.equal(createToolDisplayText({
    data: {
      content: [{ text: "", type: "text" }],
      structuredContent: { results: [{}, {}, {}] },
      text: "",
    },
    status: "success",
    toolName: "batch_tool",
  }, `items=\${items}`), "items=3");
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
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("contract_tool", "success", "ok", { value: 42 }));
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
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("error_tool", "error", "Error: boom", null));
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
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("empty_tool", "success", "", null));
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

// 6. normalized result display contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testNormalizedResultRestoresDisplay() {
  const normalized = normalizeToolResult("already_normalized_tool", createToolTextResponse("visible data"), 2);
  normalized.content[0].text = "should not be shown";

  const renormalized = normalizeToolResult("already_normalized_tool", normalized, 3);
  const output = parseStandardOutput(renormalized);

  assert.equal(renormalized.content[0].text, createExpectedDisplaySummary("already_normalized_tool", "success", "visible data", null));
  assert.equal(output.data.text, "visible data");
}

// 7. display preserves structured data ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testDisplayPreservesStructuredText() {
  const fullText = Array.from({ length: 6 }, (_value, index) => `line${index + 1} ${"x".repeat(320)}`).join("\n");
  const normalized = normalizeToolResult("preview_tool", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("preview_tool", "success", fullText, null));
}

// 9. Test long text structured data preserved ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function testLongTextStructuredDataPreserved() {
  const fullText = Array.from({ length: 50 }, (_value, index) => `line${index + 1} ${"x".repeat(640)}`).join("\n");
  const normalized = normalizeToolResult("write_files", createToolTextResponse(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("write_files", "success", fullText, null));
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

  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("batch_tool", "success", batchText, null));
  assert.equal(output.data.text, batchText);
}

// 11. Display keeps original output when context index is enabled ――――――――――――――――――――――――――――――――――
function testDisplayKeepsOriginalOutput() {
  const fullText = Array.from({ length: 180 }, (_value, index) => `line${index + 1} ${"x".repeat(640)}`).join("\n");
  const normalized = normalizeToolResult("display_compaction_tool", createToolTextResponse(fullText, {
    structuredContent: { textContent: fullText },
  }), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(normalized.content[0].text.includes(fullText), false);
  assert.equal(output.data.text.includes(fullText), true);
  assert.equal(output.data.structuredContent.textContent, fullText);
  assert.equal(Array.isArray(output.contextIndexes), true);
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("display_compaction_tool", "success", fullText, { textContent: fullText }));
}

// 12. Clear display compaction contexts ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function clearDisplayCompactionContexts() {
  const indexIds = contextIndexService
    .listDocuments()
    .filter((document) => document.toolName === "display_compaction_tool")
    .map((document) => document.indexId);

  if (indexIds.length > 0) {
    contextIndexService.clearDocuments({ indexIds });
  }
}

// 8. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  const originalConfig = await configManager.getConfig();

  try {
    await configManager.updateConfig({
      ...originalConfig,
      contextIndexEnabled: false,
    });
    testSuccessEnvelope();
    testErrorEnvelope();
    testEmptyContentFallback();
    testDurationShapeWithoutTiming();
    testNormalizedResultRestoresDisplay();
    testTemplateLiteralDisplayFormat();
    testDisplayCountsBatchStructuredItems();
    testDisplayPreservesStructuredText();
    testLongTextStructuredDataPreserved();
    testExistingSummaryPreserved();

    await configManager.updateConfig({
      ...originalConfig,
      contextIndexEnabled: true,
    });
    clearDisplayCompactionContexts();
    testDisplayKeepsOriginalOutput();
  }
  finally {
    clearDisplayCompactionContexts();
    await configManager.updateConfig(originalConfig);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
