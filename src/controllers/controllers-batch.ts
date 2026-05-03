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

function extractPrimaryText(result: ServerResult): string {
  const textChunks = result.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0);
  let primaryText = "";

  if (textChunks.length > 0) {
    primaryText = textChunks.join(" ").replace(/\s+/g, " ").trim();
  }
  return primaryText;
}

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

export function createBatchToolResponse<T>(toolName: string, items: BatchToolItemResult<T>[]): ServerResult {
  const totalCount = items.length;
  const failedCount = items.filter((item) => !item.ok).length;
  const succeededCount = totalCount - failedCount;
  const summaryLines = items.map((item) => {
    const statusText = item.ok ? "OK" : "ERROR";
    const textPreview = extractPrimaryText(item.result).slice(0, 160);

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
        input: item.input,
        ok: item.ok,
        result: item.result,
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
