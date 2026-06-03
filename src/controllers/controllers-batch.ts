/**
 * @file src/controllers/controllers-batch.ts
 * @description Shared parallel batch controller helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type { ServerResult } from "@assets/type/common";
import { createErrorResponse as crtErrRes } from "@cores/responses/responses-error";
import { isCompactEnvelopeEnabled as isCmpcEnvl } from "@cores/responses/responses-tool-result";

export declare interface BatchToolItemResult<T> {
  index: number;
  input: T;
  ok: boolean;
  result: ServerResult;
}
interface BatchToolResponseOptions {
  resultMode?: "compact" | "full";
}

const BSIK = ["path", "file_path", "source", "destination", "args_path", "sessionId", "pid", "key", "name"];
const WHTS_PAT = /\s+/g;
const INPT_ELID_MAX = 256;
const BODY_COPY_KEYS = ["textContent", "listing"];

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Elide batch input ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Echo the request back for traceability, but elide large string bodies (write content, edit
// text, base64 data). Those just re-send what the caller already holds, doubling client tokens.
// Identity fields (path, source, ...) stay short and pass through untouched.
function elideBatchInput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const entries = Object.entries(value).map(([key, item]) => {
    if (typeof item === "string") {
      const bytes = Buffer.byteLength(item, "utf8");
      if (bytes > INPT_ELID_MAX) {
        return [key, `<${bytes} bytes elided>`];
      }
    }
    return [key, item];
  });

  return Object.fromEntries(entries);
}

// 3. Strip body copy keys ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// textContent and listing duplicate the per-item content text; the batch text already carries
// the full body for full-mode tools, so the compact envelope drops these structured copies.
function stripBodyCopyKeys(structured: ServerResult["structuredContent"] | undefined): unknown {
  if (!isRecord(structured)) {
    return structured ?? null;
  }
  if (!BODY_COPY_KEYS.some((key) => key in structured)) {
    return structured;
  }
  const { textContent: _txtCont, listing: _listing, ...rest } = structured;

  return rest;
}

// 4. Create batch item result ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Compact envelope drops the per-item content copy; full envelope keeps the verbatim result.
function createBatchItemResult(result: ServerResult, compact: boolean): Record<string, unknown> {
  if (compact) {
    return {
      structuredContent: stripBodyCopyKeys(result.structuredContent),
      isError: result.isError === true,
    };
  }
  return {
    content: result.content,
    structuredContent: result.structuredContent ?? null,
    isError: result.isError === true,
  };
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
      inputPreview = summaryKey !== undefined ? String(input[summaryKey]) : JSON.stringify(elideBatchInput(input));
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

// 11-1. Create batch summary line ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Flattens the per-item text to one line without truncation; the summary line is the only body
// carrier for summary-mode tools once the compact envelope drops per-item content.
function createBatchSummaryLine<T>(item: BatchToolItemResult<T>): string {
  const statusText = item.ok ? "OK" : "ERROR";
  const inputPreview = createSummaryInputPreview(item.input);
  const textPreview = extractPrimaryText(item.result);
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
// resultMode "full" embeds each item's complete text in the batch text (read-style tools);
// "compact" keeps one flattened summary line per item. The compact envelope additionally drops
// per-item content copies and elides large input strings.
export function createBatchToolResponse<T>(toolName: string, items: BatchToolItemResult<T>[], options: BatchToolResponseOptions = {}): ServerResult {
  const totalCount = items.length;
  const failedCount = items.filter((item) => !item.ok).length;
  const sccdCnt = totalCount - failedCount;
  const smmrHdr = `${toolName}: ${sccdCnt}/${totalCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
  const resultMode = options.resultMode ?? "compact";
  const resultText = resultMode === "full"
    ? `${smmrHdr}\n\n${items.map((item) => createFullBatchDetailBlock(item)).join("\n\n")}`
    : `${smmrHdr}\n\n${items.map((item) => createBatchSummaryLine(item)).join("\n")}`;
  const compact = isCmpcEnvl();
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
        input: compact ? elideBatchInput(item.input) : item.input,
        ok: item.ok,
        result: createBatchItemResult(item.result, compact),
      })),
      succeededCount: sccdCnt,
      toolName: toolName,
      totalCount: totalCount,
    },
  };

  if (failedCount === totalCount && totalCount > 0) {
    response.isError = true;
  }
  return response;
}
