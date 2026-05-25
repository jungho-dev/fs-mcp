import assert from "node:assert/strict";
import { createToolDisplayText as crtTlDsplTxt } from "../../out/cores/responses/responses-tool-display.js";
import { createToolErrorResponse as crtTlErrRes, createToolTextResponse as crtTlTxtRes, normalizeToolResult as nrmlTlRes } from "../../out/cores/responses/responses-tool-result.js";
import { getCurrentClient as getCurClnt, updateCurrentClient as updtCurClnt } from "../../out/features/config/config-client.js";

// 2. Parse standard output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStandardOutput(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");
  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);

  return result.structuredContent;
}

function createExpectedDisplaySummary(toolName, status, text, strcCont, contentItems = 1, durationMs = null) {
  return crtTlDsplTxt({
    data: {
      content: Array.from({ length: contentItems }, () => ({ text: "", type: "text" })),
      structuredContent: strcCont,
      text,
    },
    durationMs,
    status,
    toolName,
  });
}

function testTemplateLiteralDisplayFormat() {
  const normalized = nrmlTlRes("template_tool", crtTlTxtRes("ok"), 1);
  const output = parseStandardOutput(normalized);
  const mssnPlch = `${"$"}{missing}`;

  assert.equal(crtTlDsplTxt(output, `name=\${toolName}; result=\${status}; time=\${durationMs}; bytes=\${contents}`), "name=template_tool; result=success; time=0.001 sec; bytes=2 chars");
  assert.equal(crtTlDsplTxt(output, `tokens=\${tokens}`), "tokens=1 token est");
  assert.equal(crtTlDsplTxt(output, `unknown=${mssnPlch}`), `unknown=${mssnPlch}`);
}

function testDisplayFormatsUnitsAndCommas() {
  const strcCont = { payload: "x".repeat(9017) };
  const strcChrs = JSON.stringify(strcCont).length;
  const tokenEst = Math.ceil((9045 + strcChrs) / 4);

  assert.equal(crtTlDsplTxt({
    data: {
      content: [{ text: "", type: "text" }],
      structuredContent: strcCont,
      text: "x".repeat(9045),
    },
    durationMs: 4000,
    status: "success",
    toolName: "format_tool",
  }, `time=\${durationMs}; contents=\${contents}; structured=\${structuredText}; tokens=\${tokens}`), `time=4 sec; contents=9,045 chars; structured=${strcChrs.toLocaleString("en-US")} chars; tokens=${tokenEst.toLocaleString("en-US")} token est`);
}

function testDefaultDisplayPlacesMetricsInTemplateOrder() {
  const normalized = nrmlTlRes("tokens_tool", crtTlTxtRes("abcd"), 1);
  const summary = normalized.content[0].text;
  const strcIdx = summary.indexOf("structuredText =");
  const tokenIdx = summary.indexOf("tokens =");
  const lineIdx = summary.lastIndexOf("――――");

  assert.equal(tokenIdx < strcIdx, true);
  assert.equal(lineIdx > strcIdx, true);
}

function testGeminiDisplayStripsAnsi() {
  const origClnt = getCurClnt();

  try {
    updtCurClnt({ name: "Gemini CLI", version: "1.0.0" });

    const normalized = nrmlTlRes("gemini_tool", crtTlTxtRes("ok"), 1);
    const summary = normalized.content[0].text;

    assert.equal(/\u001B\[[0-?]*[ -/]*[@-~]/.test(summary), false);
    assert.equal(summary.includes("tool = gemini_tool"), true);
    assert.equal(summary.includes("status = success"), true);
  }
  finally {
    updtCurClnt(origClnt);
  }
}

function testDisplayCountsBatchStructuredItems() {
  assert.equal(crtTlDsplTxt({
    data: {
      content: [{ text: "", type: "text" }],
      structuredContent: { results: [{}, {}], totalCount: 2 },
      text: "",
    },
    status: "success",
    toolName: "batch_tool",
  }, `items=\${count}`), "items=2");
  assert.equal(crtTlDsplTxt({
    data: {
      content: [{ text: "", type: "text" }],
      structuredContent: { results: [{}, {}, {}] },
      text: "",
    },
    status: "success",
    toolName: "batch_tool",
  }, `items=\${count}`), "items=3");
}

// 2. success envelope contract ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testSuccessEnvelope() {
  const result = crtTlTxtRes("ok", {
    structuredContent: { value: 42 },
    meta: { requestId: "contract-success" },
  });
  const normalized = nrmlTlRes("contract_tool", result, 7);
  const output = parseStandardOutput(normalized);

  assert.equal(output.schemaVersion, 1);
  assert.equal(output.toolName, "contract_tool");
  assert.equal(output.status, "success");
  assert.equal(output.durationMs, 7);
  assert.equal(output.error, null);
  assert.equal(output.data.text, "ok");
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("contract_tool", "success", "ok", { value: 42 }, 1, 7));
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
  const result = crtTlErrRes("boom");
  const normalized = nrmlTlRes("error_tool", result, 3);
  const output = parseStandardOutput(normalized);

  assert.equal(normalized.isError, true);
  assert.equal(output.status, "error");
  assert.deepEqual(output.error, { message: "Error: boom" });
  assert.equal(output.data.text, "Error: boom");
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("error_tool", "error", "Error: boom", null, 1, 3));
  assert.equal(output.data.content[0].text, "Error: boom");
  assert.equal(normalized._meta.fsMcpResult.status, "error");
  assert.equal(normalized._meta.fsMcpResult.errorMessage, "Error: boom");
}

// 4. empty content fallback ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testEmptyContentFallback() {
  const normalized = nrmlTlRes("empty_tool", { content: [] }, 1);
  const output = parseStandardOutput(normalized);

  assert.deepEqual(output.data.content, [{ type: "text", text: "" }]);
  assert.equal(output.data.text, "");
  assert.equal(output.data.structuredContent, null);
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("empty_tool", "success", "", null, 1, 1));
  assert.deepEqual(normalized._meta.fsMcpResult.contentTypes, ["text"]);
}

// 5. duration shape without timing ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testDurationShapeWithoutTiming() {
  const result = crtTlTxtRes("ok");
  const normalized = nrmlTlRes("no_duration_tool", result);
  const output = parseStandardOutput(normalized);

  assert.equal(output.durationMs, null);
  assert.equal(normalized._meta.fsMcpResult.durationMs, null);
}

// 6. normalized result display contract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testNormalizedResultRestoresDisplay() {
  const normalized = nrmlTlRes("already_normalized_tool", crtTlTxtRes("visible data"), 2);
  normalized.content[0].text = "should not be shown";

  const renormalized = nrmlTlRes("already_normalized_tool", normalized, 3);
  const output = parseStandardOutput(renormalized);

  assert.equal(renormalized.content[0].text, createExpectedDisplaySummary("already_normalized_tool", "success", "visible data", null, 1, 3));
  assert.equal(output.durationMs, 3);
  assert.equal(renormalized._meta.fsMcpResult.durationMs, 3);
  assert.equal(output.data.text, "visible data");
}

// 7. display preserves structured data ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testDisplayPreservesStructuredText() {
  const fullText = Array.from({ length: 6 }, (_value, index) => `line${index + 1} ${"x".repeat(320)}`).join("\n");
  const normalized = nrmlTlRes("preview_tool", crtTlTxtRes(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("preview_tool", "success", fullText, null, 1, 9));
}

// 9. Test long text structured data preserved ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function testLongTextStructuredDataPreserved() {
  const fullText = Array.from({ length: 50 }, (_value, index) => `line${index + 1} ${"x".repeat(640)}`).join("\n");
  const normalized = nrmlTlRes("file-write", crtTlTxtRes(fullText), 9);
  const output = parseStandardOutput(normalized);

  assert.equal(output.data.text, fullText);
  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("file-write", "success", fullText, null, 1, 9));
}

// 9-1. Test special token sanitized ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testSpecialTokenSanitized() {
  const rawToken = "<|" + "endoftext" + "|>";
  const safeToken = "<|endoftext |>";
  const fullText = "alpha " + rawToken + " omega";
  const normalized = nrmlTlRes("file-read", crtTlTxtRes(fullText, {
    structuredContent: { textContent: fullText },
  }), 9);
  const output = parseStandardOutput(normalized);
  const serialized = JSON.stringify(normalized);

  assert.equal(output.data.text, "alpha " + safeToken + " omega");
  assert.equal(output.data.structuredContent.textContent, "alpha " + safeToken + " omega");
  assert.equal(serialized.includes(rawToken), false);
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
  const normalized = nrmlTlRes("batch_tool", crtTlTxtRes(batchText), 5);
  const output = parseStandardOutput(normalized);

  assert.equal(normalized.content[0].text, createExpectedDisplaySummary("batch_tool", "success", batchText, null, 1, 5));
  assert.equal(output.data.text, batchText);
}

// 10-1. Large duplicate text stays untrimmed without indexing ―――――――――――――――――――――――――――――――――――
function testLargeDuplicateTextStaysUntrimmed() {
  const fullText = Array.from({ length: 180 }, (_value, index) => `line${index + 1} ${"x".repeat(640)}`).join("\n");
  const normalized = nrmlTlRes("large_text_tool", crtTlTxtRes(fullText, {
    structuredContent: { textContent: fullText },
  }), 9);
  const output = parseStandardOutput(normalized);
  const indexKey = "context" + "Indexes";
  const indexPrefix = "[context" + "-index:";
  const indexErrorKey = "context" + "Index";
  const serialized = JSON.stringify(output);

  assert.equal(output.data.text, fullText);
  assert.equal(output.data.content[0].text.includes("full text in data.text"), true);
  assert.equal(output.data.structuredContent.textContent, fullText);
  assert.equal(output[indexKey], undefined);
  assert.equal(serialized.includes(indexErrorKey), false);
  assert.equal(serialized.includes(indexPrefix), false);
}

// 8. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testEmptyContentFallback();
  testDurationShapeWithoutTiming();
  testNormalizedResultRestoresDisplay();
  testTemplateLiteralDisplayFormat();
  testDisplayFormatsUnitsAndCommas();
  testDefaultDisplayPlacesMetricsInTemplateOrder();
  testGeminiDisplayStripsAnsi();
  testDisplayCountsBatchStructuredItems();
  testDisplayPreservesStructuredText();
  testLongTextStructuredDataPreserved();
  testSpecialTokenSanitized();
  testExistingSummaryPreserved();
  testLargeDuplicateTextStaysUntrimmed();
}

main();
