/**
 * @file src/cores/responses/responses-tool-result.ts
 * @description MCP tool result normalization.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResponseContent, ServerResult } from "@assets/type/common";
import {createToolDisplayText} from "@cores/responses/responses-tool-display";
import {compactStandardToolOutput} from "@features/context/context-output-compactor";

export type ToolResultStatus = "success" | "error";

export interface ToolResultMetadata {
  contentTypes: string[];
  durationMs: number | null;
  errorMessage: string | null;
  hasStructuredContent: boolean;
  schemaVersion: 1;
  status: ToolResultStatus;
  toolName: string;
}
export interface ToolResultError {
  message: string;
}
export interface StandardToolOutput {
  contextIndexError?: string;
  contextIndexes?: unknown[];
  data: {
    content: ServerResponseContent[];
    structuredContent: ServerResult["structuredContent"] | null;
    text: string;
  };
  durationMs: number | null;
  error: ToolResultError | null;
  schemaVersion: 1;
  status: ToolResultStatus;
  toolName: string;
  [key: string]: unknown;
}
export interface ToolResponseOptions {
  meta?: Record<string, unknown>;
  structuredContent?: ServerResult["structuredContent"];
}

// 1. Normalize content item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeContentItem(item: ServerResponseContent): ServerResponseContent {
  const itemType = typeof item.type === "string" && item.type.length > 0 ? item.type : "text";
  const normalizedItem: ServerResponseContent = {
    ...item,
    type: itemType,
  };

  if (itemType === "text" && typeof normalizedItem.text !== "string") {
    normalizedItem.text = "";
  }
  return normalizedItem;
}

// 2. Normalize content ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeContent(content: ServerResponseContent[]): ServerResponseContent[] {
  let normalizedContent = content.map((item) => normalizeContentItem(item));

  if (normalizedContent.length === 0) {
    normalizedContent = [{ text: "", type: "text" }];
  }
  return normalizedContent;
}

// 3. Create combined text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createCombinedText(content: ServerResponseContent[]): string {
  return content.map((item) => item.text ?? "").join("\n");
}

// 4. Create error details ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createErrorDetails(status: ToolResultStatus, content: ServerResponseContent[]): ToolResultError | null {
  if (status !== "error") {
    return null;
  }
  return {
    message: createCombinedText(content),
  };
}

// 5. Create result metadata ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createResultMetadata(toolName: string, result: ServerResult, content: ServerResponseContent[], durationMs?: number): ToolResultMetadata {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const errorDetails = createErrorDetails(status, content);
  const resultMetadata: ToolResultMetadata = {
    contentTypes: content.map((item) => item.type),
    durationMs: durationMs ?? null,
    errorMessage: errorDetails?.message ?? null,
    hasStructuredContent: result.structuredContent !== undefined,
    schemaVersion: 1,
    status,
    toolName,
  };

  return resultMetadata;
}

// 6. Create standard output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createStandardOutput(toolName: string, result: ServerResult, content: ServerResponseContent[], durationMs?: number): StandardToolOutput {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const structuredContent = result.structuredContent ?? null;
  const text = createCombinedText(content);
  const standardOutput: StandardToolOutput = {
    data: {
      content,
      structuredContent,
      text,
    },
    durationMs: durationMs ?? null,
    error: createErrorDetails(status, content),
    schemaVersion: 1,
    status,
    toolName,
  };

  return standardOutput;
}

// 7. Is standard tool output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isStandardToolOutput(value: unknown): value is StandardToolOutput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<StandardToolOutput>;
  const data = candidate.data as Partial<StandardToolOutput["data"]> | undefined;

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.toolName === "string" &&
    (candidate.status === "success" || candidate.status === "error") &&
    (typeof candidate.durationMs === "number" || candidate.durationMs === null) &&
    (candidate.error === null || typeof candidate.error === "object") &&
    typeof data === "object" &&
    data !== null &&
    typeof data.text === "string" &&
    Array.isArray(data.content) &&
    Object.hasOwn(data, "structuredContent")
  );
}

// 8. Is normalized tool result ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isNormalizedToolResult(result: ServerResult): boolean {
  return isStandardToolOutput(result.structuredContent);
}

// 9. Create tool text response ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolTextResponse(text: string, options: ToolResponseOptions = {}): ServerResult {
  const response: ServerResult = {
    content: [{ text, type: "text" }],
  };

  if (options.structuredContent !== undefined) {
    response.structuredContent = options.structuredContent;
  }
  if (options.meta !== undefined) {
    response._meta = options.meta;
  }
  return response;
}

// 10. Create tool error response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolErrorResponse(message: string, options: ToolResponseOptions = {}): ServerResult {
  const response = createToolTextResponse(`Error: ${message}`, options);
  response.isError = true;

  return response;
}

// 11. Normalize tool result ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function normalizeToolResult(toolName: string, result: ServerResult, durationMs?: number): ServerResult {
  if (isNormalizedToolResult(result)) {
    const output = result.structuredContent as StandardToolOutput;

    return {
      ...result,
      content: [{ text: createToolDisplayText(output), type: "text" }],
    };
  }
  const originalContent = normalizeContent(result.content);
  const fsMcpResult = createResultMetadata(toolName, result, originalContent, durationMs);
  const originalOutput = createStandardOutput(toolName, result, originalContent, durationMs);
  const standardOutput = compactStandardToolOutput(toolName, originalOutput);
  const normalizedResult: ServerResult = {
    _meta: {
      ...result._meta,
      fsMcpResult,
    },
    content: [
      {
        text: createToolDisplayText(standardOutput),
        type: "text",
      },
    ],
    isError: result.isError === true,
    structuredContent: standardOutput,
  };

  return normalizedResult;
}
