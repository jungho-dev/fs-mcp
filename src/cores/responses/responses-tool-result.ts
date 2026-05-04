/**
 * @file src/cores/responses/responses-tool-result.ts
 * @description MCP tool result normalization.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResponseContent, ServerResult } from "@assets/type/common";

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
  data: {
    text: string;
    content: ServerResponseContent[];
    structuredContent: ServerResult["structuredContent"] | null;
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
const DISPLAY_MAX_LINES = 5;
const DISPLAY_MAX_LINE_LENGTH = 100;
const DISPLAY_MAX_CHARS = 10;
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
    normalizedContent = [{ text: "", type: "text" }];
  }
  return normalizedContent;
}
function createCombinedText(content: ServerResponseContent[]): string {
  return content.map((item) => item.text ?? "").join("\n");
}
function createNormalizedDisplayLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => createDisplayLine(line))
    .filter((line) => line.length > 0);
}
function createDisplayLine(line: string): string {
  const normalizedLine = line.trimEnd();

  if (normalizedLine.length <= DISPLAY_MAX_LINE_LENGTH) {
    return normalizedLine;
  }
  return `${normalizedLine.slice(0, DISPLAY_MAX_LINE_LENGTH - 3)}...`;
}
function createOverflowDisplayLine(line: string, hiddenLineCount: number): string {
  const suffix = ` ... (+${hiddenLineCount} more lines in structuredContent)`;
  const maxBaseLength = Math.max(0, DISPLAY_MAX_LINE_LENGTH - suffix.length);
  let displayBaseLine = createDisplayLine(line);

  if (displayBaseLine.length > maxBaseLength) {
    if (maxBaseLength <= 3) {
      displayBaseLine = "";
    } else {
      displayBaseLine = `${displayBaseLine.slice(0, maxBaseLength - 3)}...`;
    }
  }
  return `${displayBaseLine}${suffix}`;
}
function createDisplaySummary(toolName: string, normalizedLines: string[]): {previewLines: string[]; summaryLine: string} {
  const summaryPrefix = `${toolName}:`;
  let summaryLine = `${summaryPrefix} no output`;
  let previewLines: string[] = [];

  if (normalizedLines.length > 0) {
    const firstLine = normalizedLines[0];
    const hasSummaryPrefix = firstLine.startsWith(summaryPrefix);
    summaryLine = hasSummaryPrefix ? firstLine : createDisplayLine(`${summaryPrefix} ${firstLine}`);
    previewLines = normalizedLines.slice(1);
  }
  return { previewLines, summaryLine };
}
function createDisplayText(toolName: string, output: StandardToolOutput): string {
  const headerParts = [toolName, output.status];
  const normalizedDuration = output.durationMs;
  const normalizedLines = createNormalizedDisplayLines(output.data.text);
  const { previewLines, summaryLine } = createDisplaySummary(toolName, normalizedLines);
  const displayLines = [headerParts.join(" | "), summaryLine];

  if (typeof normalizedDuration === "number") {
    headerParts.push(`${normalizedDuration}ms`);
    displayLines[0] = headerParts.join(" | ");
  }
  if (previewLines.length > 0) {
    const maxPreviewLineCount = Math.max(0, DISPLAY_MAX_LINES - displayLines.length);
    const visiblePreviewLines = previewLines.slice(0, maxPreviewLineCount);
    const hiddenLineCount = previewLines.length - visiblePreviewLines.length;

    if (hiddenLineCount > 0 && visiblePreviewLines.length > 0) {
      visiblePreviewLines[visiblePreviewLines.length - 1] = createOverflowDisplayLine(visiblePreviewLines.at(-1) ?? "", hiddenLineCount);
    }
    displayLines.push(...visiblePreviewLines);
  }
  const joined = displayLines.join("\n");

  if (joined.length <= DISPLAY_MAX_CHARS) {
    return joined;
  }
  const suffix = " ... (see structuredContent)";
  const maxBase = Math.max(0, DISPLAY_MAX_CHARS - suffix.length);
  return `${joined.slice(0, maxBase)}${suffix}`;
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
export function isNormalizedToolResult(result: ServerResult): boolean {
  return isStandardToolOutput(result.structuredContent);
}
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
export function createToolErrorResponse(message: string, options: ToolResponseOptions = {}): ServerResult {
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
    _meta: {
      ...result._meta,
      fsMcpResult,
    },
    content: [
      {
        text: createDisplayText(toolName, standardOutput),
        type: "text",
      },
    ],
    isError: result.isError === true,
    structuredContent: standardOutput,
  };

  return normalizedResult;
}
