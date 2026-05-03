/**
 * @file src/cores/responses/responses-tool-result.ts
 * @description MCP tool result normalization.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResponseContent, ServerResult} from "@assets/type/common";

export type ToolResultStatus = "success" | "error";

export interface ToolResultMetadata {
  schemaVersion: 1;
  toolName: string;
  status: ToolResultStatus;
  contentTypes: string[];
  hasStructuredContent: boolean;
  durationMs: number | null;
  errorMessage: string | null;
}
export interface ToolResultError {
  message: string;
}
export interface StandardToolOutput {
  [key: string]: unknown;
  schemaVersion: 1;
  toolName: string;
  status: ToolResultStatus;
  durationMs: number | null;
  error: ToolResultError | null;
  data: {
    text: string;
    content: ServerResponseContent[];
    structuredContent: ServerResult["structuredContent"] | null;
  };
}
export interface ToolResponseOptions {
  structuredContent?: ServerResult["structuredContent"];
  meta?: Record<string, unknown>;
}
const DISPLAY_MAX_LINES = 5;
const DISPLAY_MAX_LINE_LENGTH = 160;
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
function normalizeContent(content: ServerResponseContent[]): ServerResponseContent[] {
  let normalizedContent = content.map((item) => normalizeContentItem(item));

  if (normalizedContent.length === 0) {
    normalizedContent = [{type: "text", text: ""}];
  }
  return normalizedContent;
}
function createCombinedText(content: ServerResponseContent[]): string {
  return content.map((item) => item.text ?? "").join("\n");
}
function createDisplayLine(line: string): string {
  const normalizedLine = line.trimEnd();

  if (normalizedLine.length <= DISPLAY_MAX_LINE_LENGTH) {
  	return normalizedLine;
  }
  return `${normalizedLine.slice(0, DISPLAY_MAX_LINE_LENGTH - 3)}...`;
}
function createDisplayText(toolName: string, output: StandardToolOutput): string {
  const headerParts = [toolName, output.status];
  const normalizedDuration = output.durationMs;
  const normalizedLines = output.data.text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => createDisplayLine(line))
    .filter((line) => line.length > 0);

  if (typeof normalizedDuration === "number") {
  	headerParts.push(`${normalizedDuration}ms`);
  }
  if (normalizedLines.length === 0) {
  	return headerParts.join(" | ");
  }
  if (normalizedLines.length < DISPLAY_MAX_LINES) {
  	return [headerParts.join(" | "), ...normalizedLines].join("\n");
  }
  const previewLines = normalizedLines.slice(0, DISPLAY_MAX_LINES - 1);
  const hiddenLineCount = normalizedLines.length - previewLines.length;

  previewLines[previewLines.length - 1] = `${previewLines[previewLines.length - 1]} ... (+${hiddenLineCount} more lines in structuredContent)`;

  return [
  	headerParts.join(" | "),
  	...previewLines,
  ].join("\n");
}
function createErrorDetails(status: ToolResultStatus, content: ServerResponseContent[]): ToolResultError | null {
  if (status !== "error") {
  	return null;
  }
  return {
    message: createCombinedText(content),
  };
}
function createResultMetadata(toolName: string, result: ServerResult, content: ServerResponseContent[], durationMs?: number): ToolResultMetadata {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const errorDetails = createErrorDetails(status, content);
  const resultMetadata: ToolResultMetadata = {
    schemaVersion: 1,
    toolName,
    status,
    contentTypes: content.map((item) => item.type),
    hasStructuredContent: result.structuredContent !== undefined,
    durationMs: durationMs ?? null,
    errorMessage: errorDetails?.message ?? null,
  };

  return resultMetadata;
}
function createStandardOutput(toolName: string, result: ServerResult, content: ServerResponseContent[], durationMs?: number): StandardToolOutput {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const structuredContent = result.structuredContent ?? null;
  const text = createCombinedText(content);
  const standardOutput: StandardToolOutput = {
    schemaVersion: 1,
    toolName,
    status,
    durationMs: durationMs ?? null,
    error: createErrorDetails(status, content),
    data: {
      text,
      content,
      structuredContent,
    },
  };

  return standardOutput;
}
export function isStandardToolOutput(value: unknown): value is StandardToolOutput {
  if (typeof value !== "object" || value === null) {
  	return false;
  }
  const candidate = value as Partial<StandardToolOutput>;
  const data = candidate.data as Partial<StandardToolOutput["data"]> | undefined;

  return candidate.schemaVersion === 1 && typeof candidate.toolName === "string" && (candidate.status === "success" || candidate.status === "error") && (typeof candidate.durationMs === "number" || candidate.durationMs === null) && (candidate.error === null || typeof candidate.error === "object") && typeof data === "object" && data !== null && typeof data.text === "string" && Array.isArray(data.content) && Object.hasOwn(data, "structuredContent");
}
export function isNormalizedToolResult(result: ServerResult): boolean {
  return isStandardToolOutput(result.structuredContent);
}
export function createToolTextResponse(text: string, options: ToolResponseOptions={}): ServerResult {
  const response: ServerResult = {
    content: [{type: "text", text}],
  };

  if (options.structuredContent !== undefined) {
  	response.structuredContent = options.structuredContent;
  }
  if (options.meta !== undefined) {
  	response._meta = options.meta;
  }
  return response;
}
export function createToolErrorResponse(message: string, options: ToolResponseOptions={}): ServerResult {
  const response = createToolTextResponse(`Error: ${message}`, options);
  response.isError = true;

  return response;
}
export function normalizeToolResult(toolName: string, result: ServerResult, durationMs?: number): ServerResult {
  if (isNormalizedToolResult(result)) {
  	return result;
  }
  const originalContent = normalizeContent(result.content);
  const fsMcpResult = createResultMetadata(toolName, result, originalContent, durationMs);
  const standardOutput = createStandardOutput(toolName, result, originalContent, durationMs);
  const normalizedResult: ServerResult = {
    content: [
      {
        type: "text",
        text: createDisplayText(toolName, standardOutput),
      },
    ],
    structuredContent: standardOutput,
    isError: result.isError === true,
    _meta: {
      ...result._meta,
      fsMcpResult,
    },
  };

  return normalizedResult;
}
