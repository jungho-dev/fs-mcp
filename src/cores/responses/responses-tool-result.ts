/**
 * @file src/cores/responses/responses-tool-result.ts
 * @description MCP tool result normalization.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResponseContent as SrvrResCont, ServerResult } from "@assets/type/common";
import {createToolDisplayText as crtTlDsplTxt} from "@cores/responses/responses-tool-display";
import {compactStandardToolOutput as cmpStTlOt} from "@features/context/context-output-compactor";

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
    content: SrvrResCont[];
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
const DTCML = 512;
const DTCPL = 160;
const DTCS = "\n... (preview; full text in data.text)";

// 1. Normalize content item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeContentItem(item: SrvrResCont): SrvrResCont {
  const itemType = typeof item.type === "string" && item.type.length > 0 ? item.type : "text";
  const normItm: SrvrResCont = {
    ...item,
    type: itemType,
  };

  if (itemType === "text" && typeof normItm.text !== "string") {
    normItm.text = "";
  }
  return normItm;
}

// 2. Normalize content ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeContent(content: SrvrResCont[]): SrvrResCont[] {
  let normCont2 = content.map((item) => normalizeContentItem(item));

  if (normCont2.length === 0) {
    normCont2 = [{ text: "", type: "text" }];
  }
  return normCont2;
}

// 3. Create combined text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createCombinedText(content: SrvrResCont[]): string {
  return content.map((item) => item.text ?? "").join("\n");
}

// 4. Create error details ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createErrorDetails(status: ToolResultStatus, content: SrvrResCont[]): ToolResultError | null {
  if (status !== "error") {
    return null;
  }
  return {
    message: createCombinedText(content),
  };
}

// 5. Create result metadata ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createResultMetadata(toolName: string, result: ServerResult, content: SrvrResCont[], durationMs?: number): ToolResultMetadata {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const errorDetails = createErrorDetails(status, content);
  const resMeta: ToolResultMetadata = {
    contentTypes: content.map((item) => item.type),
    durationMs: durationMs ?? null,
    errorMessage: errorDetails?.message ?? null,
    hasStructuredContent: result.structuredContent !== undefined,
    schemaVersion: 1,
    status,
    toolName,
  };

  return resMeta;
}

// 6. Create standard output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createStandardOutput(toolName: string, result: ServerResult, content: SrvrResCont[], durationMs?: number): StandardToolOutput {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const strcCont = result.structuredContent ?? null;
  const text = createCombinedText(content);
  const stndOtpt: StandardToolOutput = {
    data: {
      content,
      structuredContent: strcCont,
      text,
    },
    durationMs: durationMs ?? null,
    error: createErrorDetails(status, content),
    schemaVersion: 1,
    status,
    toolName,
  };

  return stndOtpt;
}

// 6-1. Create duplicate text content preview ――――――――――――――――――――――――――――――――――――――――――――――――
function createDuplicateTextContentPreview(value: string): string {
  const preview = value.slice(0, DTCPL);

  return `${preview}${DTCS}`;
}

// 6-2. Compact duplicate text content ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function compactDuplicateTextContent(output: StandardToolOutput): StandardToolOutput {
  const dataText = output.data.text;

  if (dataText.length <= DTCML) {
    return output;
  }
  let compacted = false;
  const content = output.data.content.map((item) => {
    if (item.type !== "text" || typeof item.text !== "string") {
      return item;
    }
    if (item.text.length <= DTCML || !dataText.includes(item.text)) {
      return item;
    }
    compacted = true;

    return {
      ...item,
      text: createDuplicateTextContentPreview(item.text),
    };
  });

  if (!compacted) {
    return output;
  }
  return {
    ...output,
    data: {
      ...output.data,
      content,
    },
  };
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
    const output = compactDuplicateTextContent(result.structuredContent as StandardToolOutput);

    return {
      ...result,
      content: [{ text: crtTlDsplTxt(output), type: "text" }],
      structuredContent: output,
    };
  }
  const origCont = normalizeContent(result.content);
  const fsMcpResult = createResultMetadata(toolName, result, origCont, durationMs);
  const origOtpt = createStandardOutput(toolName, result, origCont, durationMs);
  const stndOtpt = compactDuplicateTextContent(cmpStTlOt(toolName, origOtpt));
  const normRes: ServerResult = {
    _meta: {
      ...result._meta,
      fsMcpResult,
    },
    content: [
      {
        text: crtTlDsplTxt(stndOtpt),
        type: "text",
      },
    ],
    isError: result.isError === true,
    structuredContent: stndOtpt,
  };

  return normRes;
}
