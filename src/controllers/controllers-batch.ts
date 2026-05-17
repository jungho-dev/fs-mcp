/**
 * @file src/controllers/controllers-batch.ts
 * @description Shared parallel batch controller helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type { ServerResult } from "@assets/type/common";
import { createErrorResponse as crtErrRes } from "@cores/responses/responses-error";

export declare interface BatchToolItemResult<T> {
  index: number;
  input: T;
  ok: boolean;
  result: ServerResult;
}
interface BatchToolResponseOptions {
  preserveLargeStructuredPayloads?: boolean;
  resultMode?: "compact" | "full";
}
interface BatchResultCompactionOptions {
  preserveLargeStructuredPayloads?: boolean;
}

interface CompactedStringPayload {
  lineCount: number;
  originalLength: number;
  preview: string;
  previewOnly: true;
}
interface PreservedTextPayload extends Record<string, unknown> {
  lineCount: number;
  originalLength: number;
  textContent: string;
}

const BIPL = 160;
const BRPL = 160;
const BLIF = new Set(["blob", "content", "data", "imageData", "listing", "new_string", "old_string", "textContent"]);
const BSIK = ["path", "file_path", "source", "destination", "args_path", "sessionId", "pid", "key", "name"];
const BSIPL = 80;
const BSPF = ["imageData", "listing", "textContent"];
const BSTPF = new Set(["listing", "textContent"]);
const LN_SPLT_PAT = /\r\n|\r|\n/;
const WHTS_PAT = /\s+/g;

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Count lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countLines(value: string): number {
  return value.length === 0 ? 0 : value.split(LN_SPLT_PAT).length;
}

// 3. Create compacted string payload ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createCompactedStringPayload(value: string, prvwLen: number): CompactedStringPayload {
  const preview = value.length <= prvwLen ? value : `${value.slice(0, prvwLen)}...`;

  return {
    lineCount: countLines(value),
    originalLength: value.length,
    preview: preview,
    previewOnly: true,
  };
}

// 3-1. Is preserved text payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isPresTextPayload(value: Record<string, unknown>): value is PreservedTextPayload {
  return typeof value.textContent === "string" && typeof value.lineCount === "number" && typeof value.originalLength === "number" && !Object.hasOwn(value, "filePath");
}

// 3-2. Compact structured text payloads ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactStructuredTextPayloads(value: ServerResult["structuredContent"]): ServerResult["structuredContent"] {
  if (!isRecord(value) || isPresTextPayload(value)) {
    return value;
  }
  let changed = false;
  const compacted = Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (BSTPF.has(key) && typeof item === "string" && item.length > BRPL) {
      changed = true;
      return [key, createCompactedStringPayload(item, BRPL)];
    }
    return [key, item];
  }));

  return changed ? compacted : value;
}

// 4. Compact batch input ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchInput(value: unknown, fieldName: string | null = null): unknown {
  if (typeof value === "string") {
    if (fieldName !== null && BLIF.has(fieldName) && value.length > BIPL) {
      return createCompactedStringPayload(value, BIPL);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => compactBatchInput(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactBatchInput(item, key)]));
  }
  return value;
}

// 4-1. Create summary text preview ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createSummaryTextPreview(value: string, maxLength: number): string {
  const cmpcVal = value.replace(WHTS_PAT, " ").trim();
  let preview = cmpcVal;

  if (cmpcVal.length > maxLength) {
    preview = `${cmpcVal.slice(0, Math.max(0, maxLength - 3))}...`;
  }
  return preview;
}

// 4-2. Create summary input preview ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createSummaryInputPreview(input: unknown): string {
  let inputPreview = "";

  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    inputPreview = String(input);
  }
  else if (Array.isArray(input)) {
    inputPreview = `[${input.length} items]`;
  }
  else if (isRecord(input)) {
    const source = input.source;
    const destination = input.destination;

    if (typeof source === "string" && typeof destination === "string") {
      inputPreview = `${source} -> ${destination}`;
    }
    else {
      const summaryKey = BSIK.find((key) => input[key] !== undefined);
      inputPreview = summaryKey !== undefined ? String(input[summaryKey]) : JSON.stringify(compactBatchInput(input));
    }
  }
  return createSummaryTextPreview(inputPreview, BSIPL);
}

// 5. Extract primary text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractPrimaryText(result: ServerResult): string {
  const textChunks = result.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0);
  let primaryText = "";

  if (textChunks.length > 0) {
    primaryText = textChunks.join(" ").replace(WHTS_PAT, " ").trim();
  }
  return primaryText;
}

// 6. Extract text content ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractTextContent(result: ServerResult): string {
  const textChunks = result.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text ?? "");

  return textChunks.join("\n");
}

// 7. Create preserved text payload ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createPreservedTextPayload(text: string): PreservedTextPayload {
  return {
    lineCount: countLines(text),
    originalLength: text.length,
    textContent: text,
  };
}

// 8. Preserve unstructured result text ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function preserveUnstructuredResultText(result: ServerResult, text: string): ServerResult {
  if (result.structuredContent !== undefined || text.length <= BRPL) {
    return result;
  }
  return {
    ...result,
    structuredContent: createPreservedTextPayload(text),
  };
}

// 9. Has large structured payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function hasLargeStructuredPayload(result: ServerResult): boolean {
  const strcCont = result.structuredContent;
  let hasPayload = false;

  if (isRecord(strcCont)) {
    hasPayload = BSPF.some((fieldName) => {
      const value = strcCont[fieldName];

      return typeof value === "string" && value.length > BRPL;
    });
  }
  return hasPayload;
}

// 10. Create result text preview ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createResultTextPreview(text: string): string {
  const cmpcTxt = text.replace(WHTS_PAT, " ").trim();
  const suffix = " ... (preview)";
  let preview = cmpcTxt;

  if (cmpcTxt.length > BRPL) {
    const prvwLen = Math.max(0, BRPL - suffix.length);
    preview = `${cmpcTxt.slice(0, prvwLen)}${suffix}`;
  }
  return preview;
}

// 11. Compact batch result ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchResult(result: ServerResult, options: BatchResultCompactionOptions = {}): ServerResult {
  const prsLrStPy = options.preserveLargeStructuredPayloads ?? true;
  const primaryText = extractPrimaryText(result);
  const originalText = extractTextContent(result);
  const prsrRes = preserveUnstructuredResultText(result, originalText);
  const strcCont = prsLrStPy ? prsrRes.structuredContent : compactStructuredTextPayloads(prsrRes.structuredContent);

  if (!hasLargeStructuredPayload(prsrRes) && primaryText.length <= BRPL) {
    return strcCont === prsrRes.structuredContent ? prsrRes : {...prsrRes, structuredContent: strcCont};
  }
  return {
    ...prsrRes,
    content: prsrRes.content.map((item) => {
      if (item.type === "text" && typeof item.text === "string") {
        return {
          ...item,
          text: createResultTextPreview(item.text),
        };
      }
      return item;
    }),
    structuredContent: strcCont,
  };
}

// 11-1. Create batch summary line ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createBatchSummaryLine<T>(item: BatchToolItemResult<T>): string {
  const statusText = item.ok ? "OK" : "ERROR";
  const inputPreview = createSummaryInputPreview(item.input);
  const textPreview = createResultTextPreview(extractPrimaryText(item.result));
  const detailParts = [inputPreview, textPreview].filter((part) => part.length > 0);
  const detailText = detailParts.length > 0 ? ` ${detailParts.join(": ")}` : "";

  return `- [${item.index}] ${statusText}${detailText}`;
}

// 11-2. Create full batch detail block ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createFullBatchDetailBlock<T>(item: BatchToolItemResult<T>): string {
  const statusText = item.ok ? "OK" : "ERROR";
  const inputPreview = createSummaryInputPreview(item.input);
  const text = extractTextContent(item.result).trim();
  const header = `- [${item.index}] ${statusText}${inputPreview.length > 0 ? ` ${inputPreview}` : ""}`;

  return text.length > 0 ? `${header}\n${text}` : header;
}

// 12. Run parallel batch ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runParallelBatch<T>(items: T[], runItem: (item: T) => Promise<ServerResult>): Promise<BatchToolItemResult<T>[]> {
  const results = await Promise.all(
    items.map(async (item, index) => {
      let itemResult: ServerResult;

      try {
        itemResult = await runItem(item);
      }
      catch (error) {
        itemResult = crtErrRes(error instanceof Error ? error.message : String(error));
      }

      return {
        index: index + 1,
        input: item,
        ok: itemResult.isError !== true,
        result: itemResult,
      };
    }),
  );

  return results;
}

// 12-1. Run limited parallel batch ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runLimitedParallelBatch<T>(items: T[], concurrency: number, runItem: (item: T) => Promise<ServerResult>): Promise<BatchToolItemResult<T>[]> {
  const results: BatchToolItemResult<T>[] = new Array(items.length);
  const normCncr = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1;
  const workerCount = Math.max(1, Math.min(items.length, normCncr));
  let nextIndex = 0;

  async function runItemAtIndex(index: number): Promise<void> {
    const item = items[index];
    let itemResult: ServerResult;

    try {
      itemResult = await runItem(item);
    }
    catch (error) {
      itemResult = crtErrRes(error instanceof Error ? error.message : String(error));
    }

    results[index] = {
      index: index + 1,
      input: item,
      ok: itemResult.isError !== true,
      result: itemResult,
    };
  }

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await runItemAtIndex(index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

// 13. Create batch tool response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createBatchToolResponse<T>(toolName: string, items: BatchToolItemResult<T>[], options: BatchToolResponseOptions = {}): ServerResult {
  const totalCount = items.length;
  const failedCount = items.filter((item) => !item.ok).length;
  const sccdCnt = totalCount - failedCount;
  const summaryLines = items.map((item) => createBatchSummaryLine(item));
  const smmrHdr = `${toolName}: ${sccdCnt}/${totalCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
  const resultMode = options.resultMode ?? "compact";
  const prsLrStPy = options.preserveLargeStructuredPayloads ?? resultMode === "full";
  const resultText = resultMode === "full" ? `${smmrHdr}\n\n${items.map((item) => createFullBatchDetailBlock(item)).join("\n\n")}` : `${smmrHdr}\n\n${summaryLines.join("\n")}`;
  const response: ServerResult = {
    content: [
      {
        type: "text",
        text: resultText,
      },
    ],
    structuredContent: {
      failedCount: failedCount,
      results: items.map((item) => ({
        index: item.index,
        input: compactBatchInput(item.input),
        ok: item.ok,
        result: compactBatchResult(item.result, { preserveLargeStructuredPayloads: prsLrStPy }),
      })),
      succeededCount: sccdCnt,
      toolName: toolName,
      totalCount: totalCount,
    },
  };

  if (failedCount === totalCount) {
    response.isError = true;
  }
  return response;
}
