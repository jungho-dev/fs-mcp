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

interface PreservedTextPayload extends Record<string, unknown> {
  lineCount: number;
  originalLength: number;
  textContent: string;
}

const BSIK = ["path", "file_path", "source", "destination", "args_path", "sessionId", "pid", "key", "name"];
const LN_SPLT_PAT = /\r\n|\r|\n/;
const WHTS_PAT = /\s+/g;
const TEXT_PREVIEW_CHARS = 768;

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Count lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countLines(value: string): number {
  return value.length === 0 ? 0 : value.split(LN_SPLT_PAT).length;
}

// 4. Compact batch input ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => compactBatchInput(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactBatchInput(item)]));
  }
  return value;
}

// 4-1. Create summary text preview ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createSummaryTextPreview(value: string): string {
  const cmpcVal = value.replace(WHTS_PAT, " ").trim();

  return cmpcVal;
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
  return createSummaryTextPreview(inputPreview);
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
  if (result.structuredContent !== undefined || text.length === 0) {
    return result;
  }
  return {
    ...result,
    structuredContent: createPreservedTextPayload(text),
  };
}

// 10. Create result text preview ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createResultTextPreview(text: string): string {
  const cmpcTxt = text.replace(WHTS_PAT, " ").trim();

  if (cmpcTxt.length <= TEXT_PREVIEW_CHARS) {
    return cmpcTxt;
  }
  return `${cmpcTxt.slice(0, TEXT_PREVIEW_CHARS)}... [truncated ${cmpcTxt.length - TEXT_PREVIEW_CHARS} chars]`;
}

// 10-1. Has structured text copy ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function hasStructuredTextCopy(result: ServerResult, text: string): boolean {
  const strcCont = result.structuredContent;

  return isRecord(strcCont) && strcCont.textContent === text;
}

// 10-2. Compact duplicate text item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactDuplicateTextItem(item: ServerResult["content"][number]): ServerResult["content"][number] {
  if (item.type !== "text" || typeof item.text !== "string" || item.text.length <= TEXT_PREVIEW_CHARS) {
    return item;
  }
  return {
    ...item,
    text: `${item.text.slice(0, TEXT_PREVIEW_CHARS)}\n[truncated ${item.text.length - TEXT_PREVIEW_CHARS} chars; full text in structuredContent.textContent]`,
  };
}

// 11. Compact batch result ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchResult(result: ServerResult): ServerResult {
  const originalText = extractTextContent(result);
  const prsrRes = preserveUnstructuredResultText(result, originalText);

  if (!hasStructuredTextCopy(prsrRes, originalText)) {
    return prsrRes;
  }
  return {
    ...prsrRes,
    content: prsrRes.content.map((item) => compactDuplicateTextItem(item)),
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
        result: compactBatchResult(item.result),
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
