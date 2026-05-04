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
interface DisplayPreviewLines {
  hasHiddenLines: boolean;
  lines: string[];
}
interface DisplayLineRange {
  end: number;
  nextStart: number;
}
const DISPLAY_MAX_LINES = 5;
const DISPLAY_MAX_LINE_LENGTH = 30;
const DISPLAY_MAX_CHARS = 30;
const DISPLAY_OVERFLOW_SUFFIX = " ... (truncated)";

// 1. Normalize content item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 2. Normalize content ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeContent(content: ServerResponseContent[]): ServerResponseContent[] {
  let normalizedContent = content.map((item) => normalizeContentItem(item));

  if (normalizedContent.length === 0) {
    normalizedContent = [{ text: "", type: "text" }];
  }
  return normalizedContent;
}

// 3. Create combined text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createCombinedText(content: ServerResponseContent[]): string {
  return content.map((item) => item.text ?? "").join("\n");
}

// 4. Create display line ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createDisplayLine(line: string): string {
  const normalizedLine = line.trimEnd();

  if (normalizedLine.length <= DISPLAY_MAX_LINE_LENGTH) {
    return normalizedLine;
  }
  return `${normalizedLine.slice(0, DISPLAY_MAX_LINE_LENGTH - 3)}...`;
}

// 5. Create overflow display line ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createOverflowDisplayLine(line: string): string {
  const suffix = " ... (more output truncated)";
  const maxBaseLength = Math.max(0, DISPLAY_MAX_LINE_LENGTH - suffix.length);
  let displayBaseLine = createDisplayLine(line);

  if (displayBaseLine.length > maxBaseLength) {
    if (maxBaseLength <= 3) {
      displayBaseLine = "";
    }
    else {
      displayBaseLine = `${displayBaseLine.slice(0, maxBaseLength - 3)}...`;
    }
  }
  return `${displayBaseLine}${suffix}`;
}

// 6. Has display line content ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function hasDisplayLineContent(text: string, start: number, end: number): boolean {
  let hasContent = false;
  let index = start;

  while (!hasContent && index < end) {
    const char = text[index] ?? "";
    hasContent = char.trim().length > 0;
    index += 1;
  }
  return hasContent;
}

// 7. Find display line range ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function findDisplayLineRange(text: string, start: number, hasCarriageReturns: boolean): DisplayLineRange {
  if (!hasCarriageReturns) {
    const nextLineFeed = text.indexOf("\n", start);
    const end = nextLineFeed >= 0 ? nextLineFeed : text.length;
    const nextStart = nextLineFeed >= 0 ? nextLineFeed + 1 : text.length + 1;

    return { end, nextStart };
  }

  const nextLineFeed = text.indexOf("\n", start);
  const nextCarriageReturn = text.indexOf("\r", start);
  let end = text.length;
  let nextStart = text.length + 1;

  if (nextLineFeed >= 0 && (nextCarriageReturn < 0 || nextLineFeed < nextCarriageReturn)) {
    end = nextLineFeed;
    nextStart = nextLineFeed + 1;
  }
  else if (nextCarriageReturn >= 0) {
    end = nextCarriageReturn;
    nextStart = text[nextCarriageReturn + 1] === "\n" ? nextCarriageReturn + 2 : nextCarriageReturn + 1;
  }
  return { end, nextStart };
}

// 8. Create display preview lines ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createDisplayPreviewLines(text: string, maxLines: number): DisplayPreviewLines {
  const lines: string[] = [];
  const hasCarriageReturns = text.includes("\r");
  let hasHiddenLines = false;
  let lineStart = 0;

  while (!hasHiddenLines && lineStart <= text.length) {
    const lineRange = findDisplayLineRange(text, lineStart, hasCarriageReturns);

    if (lines.length < maxLines) {
      const displayLine = createDisplayLine(text.slice(lineStart, lineRange.end));
      if (displayLine.length > 0) {
        lines.push(displayLine);
      }
    }
    else if (hasDisplayLineContent(text, lineStart, lineRange.end)) {
      hasHiddenLines = true;
    }

    lineStart = lineRange.nextStart;
  }
  return { hasHiddenLines, lines };
}

// 9. Create display summary ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 10. Limit display text ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function limitDisplayText(text: string): string {
  let displayText = text;

  if (displayText.length > DISPLAY_MAX_CHARS) {
    const maxBaseLength = DISPLAY_MAX_CHARS - DISPLAY_OVERFLOW_SUFFIX.length;

    if (maxBaseLength > 0) {
      displayText = `${displayText.slice(0, maxBaseLength)}${DISPLAY_OVERFLOW_SUFFIX}`;
    }
    else {
      displayText = DISPLAY_OVERFLOW_SUFFIX.slice(0, DISPLAY_MAX_CHARS);
    }
  }
  return displayText;
}

// 11. Create display text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createDisplayText(toolName: string, output: StandardToolOutput): string {
  const headerParts = [toolName, output.status];
  const normalizedDuration = output.durationMs;
  const displayLineLimit = Math.max(1, DISPLAY_MAX_LINES - 1);
  const normalizedPreview = createDisplayPreviewLines(output.data.text, displayLineLimit);
  const normalizedLines = normalizedPreview.lines;
  const { previewLines, summaryLine } = createDisplaySummary(toolName, normalizedLines);
  const displayLines = [createDisplayLine(headerParts.join(" | ")), summaryLine];

  if (typeof normalizedDuration === "number") {
    headerParts.push(`${normalizedDuration}ms`);
    displayLines[0] = createDisplayLine(headerParts.join(" | "));
  }
  if (previewLines.length > 0) {
    const visiblePreviewLines = previewLines.slice();

    if (normalizedPreview.hasHiddenLines && visiblePreviewLines.length > 0) {
      visiblePreviewLines[visiblePreviewLines.length - 1] = createOverflowDisplayLine(visiblePreviewLines.at(-1) ?? "");
    }
    displayLines.push(...visiblePreviewLines);
  }
  const displayText = limitDisplayText(displayLines.join("\n"));

  return displayText;
}

// 12. Create error details ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createErrorDetails(status: ToolResultStatus, content: ServerResponseContent[]): ToolResultError | null {
  if (status !== "error") {
    return null;
  }
  return {
    message: createCombinedText(content),
  };
}

// 13. Create result metadata ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 14. Create standard output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 15. Is standard tool output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 16. Is normalized tool result ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isNormalizedToolResult(result: ServerResult): boolean {
  return isStandardToolOutput(result.structuredContent);
}

// 17. Create tool text response ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 18. Create tool error response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolErrorResponse(message: string, options: ToolResponseOptions = {}): ServerResult {
  const response = createToolTextResponse(`Error: ${message}`, options);
  response.isError = true;

  return response;
}

// 19. Normalize tool result ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
