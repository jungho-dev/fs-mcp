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

interface CompactedStringPayload {
  lineCount: number;
  omitted: true;
  originalLength: number;
  preview: string;
}

const BATCH_INPUT_PREVIEW_LENGTH = 160;
const BATCH_RESULT_PREVIEW_LENGTH = 30;
const BATCH_LARGE_INPUT_FIELDS = new Set(["blob", "content", "data", "imageData", "listing", "new_string", "old_string", "textContent"]);
const BATCH_STRUCTURED_PAYLOAD_FIELDS = ["imageData", "listing", "textContent"];
const LINE_SPLIT_PATTERN = /\r\n|\r|\n/;
const WHITESPACE_PATTERN = /\s+/g;

// 1. Is record ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Count lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countLines(value: string): number {
  return value.length === 0 ? 0 : value.split(LINE_SPLIT_PATTERN).length;
}

// 3. Create compacted string payload ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createCompactedStringPayload(value: string, previewLength: number): CompactedStringPayload {
  const preview = value.length <= previewLength ? value : `${value.slice(0, previewLength)}...`;

  return {
    lineCount: countLines(value),
    omitted: true,
    originalLength: value.length,
    preview: preview,
  };
}

// 4. Compact batch input ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 5. Extract primary text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 6. Has large structured payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 7. Create result text preview ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 8. Compact batch result ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactBatchResult(result: ServerResult): ServerResult {
  const primaryText = extractPrimaryText(result);

  if (!hasLargeStructuredPayload(result) && primaryText.length <= BATCH_RESULT_PREVIEW_LENGTH) {
    return result;
  }
  return {
    ...result,
    content: result.content.map((item) => {
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

// 9. Run parallel batch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runParallelBatch<T>(items: T[], runItem: (item: T) => Promise<ServerResult>): Promise<BatchToolItemResult<T>[]> {
  const results = await Promise.all(
    items.map(async (item, index) => {
      let itemResult: ServerResult;

      try {
        itemResult = await runItem(item);
      } catch (error) {
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

// 10. Create batch tool response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createBatchToolResponse<T>(toolName: string, items: BatchToolItemResult<T>[]): ServerResult {
  const totalCount = items.length;
  const failedCount = items.filter((item) => !item.ok).length;
  const succeededCount = totalCount - failedCount;
  const summaryLines = items.map((item) => {
    const statusText = item.ok ? "OK" : "ERROR";
    const textPreview = extractPrimaryText(item.result).slice(0, BATCH_RESULT_PREVIEW_LENGTH);

    return `[${item.index}] ${statusText} ${textPreview}`;
  });
  const summaryHeader = `${toolName}: ${succeededCount}/${totalCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
  const response: ServerResult = {
    content: [
      {
        type: "text",
        text: `${summaryHeader}\n\n${summaryLines.join("\n")}`,
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
