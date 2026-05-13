/**
 * @file src/controllers/controllers-batch.ts
 * @description Shared parallel batch controller helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type { ServerResult } from "@assets/type/common";
import { createErrorResponse } from "@cores/responses/responses-error";

export interface BatchToolItemResult<T> {
  index: number;
  input: T;
  ok: boolean;
  result: ServerResult;
}
interface BatchToolResponseOptions {
  resultMode?: "compact" | "full";
}

interface CompactedStringPayload {
  lineCount: number;
  omitted: true;
  originalLength: number;
  preview: string;
}
interface PreservedTextPayload extends Record<string, unknown> {
  lineCount: number;
  originalLength: number;
  textContent: string;
}

const BATCH_INPUT_PREVIEW_LENGTH = 160;
const BATCH_RESULT_PREVIEW_LENGTH = 160;
const BATCH_LARGE_INPUT_FIELDS = new Set(["blob", "content", "data", "imageData", "listing", "new_string", "old_string", "textContent"]);
const BATCH_SUMMARY_INPUT_KEYS = ["path", "file_path", "source", "destination", "args_path", "sessionId", "pid", "key", "name"];
const BATCH_SUMMARY_INPUT_PREVIEW_LENGTH = 80;
const BATCH_STRUCTURED_PAYLOAD_FIELDS = ["imageData", "listing", "textContent"];
const LINE_SPLIT_PATTERN = /\r\n|\r|\n/;
const WHITESPACE_PATTERN = /\s+/g;

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Count lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countLines(value: string): number {
  return value.length === 0 ? 0 : value.split(LINE_SPLIT_PATTERN).length;
}

// 3. Create compacted string payload ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createCompactedStringPayload(value: string, previewLength: number): CompactedStringPayload {
  const preview = value.length <= previewLength ? value : `${value.slice(0, previewLength)}...`;

  return {
    lineCount: countLines(value),
    omitted: true,
    originalLength: value.length,
    preview: preview,
  };
}

// 4. Compact batch input ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchInput(value: unknown, fieldName: string | null = null): unknown {
  if (typeof value === "string") {
    if (fieldName !== null && BATCH_LARGE_INPUT_FIELDS.has(fieldName) && value.length > BATCH_INPUT_PREVIEW_LENGTH) {
      return createCompactedStringPayload(value, BATCH_INPUT_PREVIEW_LENGTH);
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
  const compactedValue = value.replace(WHITESPACE_PATTERN, " ").trim();
  let preview = compactedValue;

  if (compactedValue.length > maxLength) {
    preview = `${compactedValue.slice(0, Math.max(0, maxLength - 3))}...`;
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
      const summaryKey = BATCH_SUMMARY_INPUT_KEYS.find((key) => input[key] !== undefined);
      inputPreview = summaryKey !== undefined ? String(input[summaryKey]) : JSON.stringify(compactBatchInput(input));
    }
  }
  return createSummaryTextPreview(inputPreview, BATCH_SUMMARY_INPUT_PREVIEW_LENGTH);
}

// 5. Extract primary text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractPrimaryText(result: ServerResult): string {
  const textChunks = result.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0);
  let primaryText = "";

  if (textChunks.length > 0) {
    primaryText = textChunks.join(" ").replace(WHITESPACE_PATTERN, " ").trim();
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
  if (result.structuredContent !== undefined || text.length <= BATCH_RESULT_PREVIEW_LENGTH) {
    return result;
  }
  return {
    ...result,
    structuredContent: createPreservedTextPayload(text),
  };
}

// 9. Has large structured payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function hasLargeStructuredPayload(result: ServerResult): boolean {
  const structuredContent = result.structuredContent;
  let hasPayload = false;

  if (isRecord(structuredContent)) {
    hasPayload = BATCH_STRUCTURED_PAYLOAD_FIELDS.some((fieldName) => {
      const value = structuredContent[fieldName];

      return typeof value === "string" && value.length > BATCH_RESULT_PREVIEW_LENGTH;
    });
  }
  return hasPayload;
}

// 10. Create result text preview ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createResultTextPreview(text: string): string {
  const compactedText = text.replace(WHITESPACE_PATTERN, " ").trim();
  const suffix = " ... (omitted)";
  let preview = compactedText;

  if (compactedText.length > BATCH_RESULT_PREVIEW_LENGTH) {
    const previewLength = Math.max(0, BATCH_RESULT_PREVIEW_LENGTH - suffix.length);
    preview = `${compactedText.slice(0, previewLength)}${suffix}`;
  }
  return preview;
}

// 11. Compact batch result ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchResult(result: ServerResult): ServerResult {
  const primaryText = extractPrimaryText(result);
  const originalText = extractTextContent(result);
  const preservedResult = preserveUnstructuredResultText(result, originalText);

  if (!hasLargeStructuredPayload(preservedResult) && primaryText.length <= BATCH_RESULT_PREVIEW_LENGTH) {
    return preservedResult;
  }
  return {
    ...preservedResult,
    content: preservedResult.content.map((item) => {
      if (item.type === "text" && typeof item.text === "string") {
        return {
          ...item,
          text: createResultTextPreview(item.text),
        };
      }
      return item;
    }),
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
        itemResult = createErrorResponse(error instanceof Error ? error.message : String(error));
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
  const normalizedConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1;
  const workerCount = Math.max(1, Math.min(items.length, normalizedConcurrency));
  let nextIndex = 0;

  async function runItemAtIndex(index: number): Promise<void> {
    const item = items[index];
    let itemResult: ServerResult;

    try {
      itemResult = await runItem(item);
    }
    catch (error) {
      itemResult = createErrorResponse(error instanceof Error ? error.message : String(error));
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
  const succeededCount = totalCount - failedCount;
  const summaryLines = items.map((item) => createBatchSummaryLine(item));
  const summaryHeader = `${toolName}: ${succeededCount}/${totalCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
  const resultMode = options.resultMode ?? "compact";
  const resultText = resultMode === "full" ? `${summaryHeader}\n\n${items.map((item) => createFullBatchDetailBlock(item)).join("\n\n")}` : `${summaryHeader}\n\n${summaryLines.join("\n")}`;
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
        result: resultMode === "full" ? item.result : compactBatchResult(item.result),
      })),
      succeededCount: succeededCount,
      toolName: toolName,
      totalCount: totalCount,
    },
  };

  if (failedCount === totalCount) {
    response.isError = true;
  }
  return response;
}
