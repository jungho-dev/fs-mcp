/**
 * @file src/cores/responses/responses-tool-result.ts
 * @description MCP tool result normalization.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult, ServerResponseContent as SrvrResCont } from "@assets/type/common";
import {createToolDisplayText as crtTlDsplTxt} from "@cores/responses/responses-tool-display";

export declare type ToolResultStatus = "success" | "error";

export declare interface ToolResultMetadata {
  contentTypes: string[];
  durationMs: number | null;
  errorMessage: string | null;
  hasStructuredContent: boolean;
  schemaVersion: 1;
  status: ToolResultStatus;
  toolName: string;
}
export declare interface ToolResultError {
  message: string;
}
export declare interface StandardToolOutput {
  data: {
    content: SrvrResCont[];
    structuredContent: ServerResult["structuredContent"] | null;
    text?: string;
  };
  durationMs: number | null;
  error: ToolResultError | null;
  schemaVersion: 1;
  status: ToolResultStatus;
  toolName: string;
  [key: string]: unknown;
}
export declare interface ToolResponseOptions {
  meta?: Record<string, unknown>;
  structuredContent?: ServerResult["structuredContent"];
}
const DSTP = /<\|endoftext\|>/g;
const DST = "<|endoftext|>";
const DSTR = "<|endoftext |>";

// Default-on compact envelope: drops the data.text copy that duplicates data.content for
// token-sensitive clients. Opt out with FS_MCP_COMPACT=0 (or false) to restore data.text.
function resolveCompactEnabled(): boolean {
  const raw = process.env.FS_MCP_COMPACT;

  if (raw === undefined || raw === "") {
    return true;
  }
  return raw !== "0" && raw !== "false";
}
const CMPC_ENVL = resolveCompactEnabled();

// 0. Compact envelope flag ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isCompactEnvelopeEnabled(): boolean {
  return CMPC_ENVL;
}

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
  if (itemType === "text") {
    normItm.text = sanitizeText(normItm.text ?? "");
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

// 3-1. Sanitize text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function sanitizeText(value: string): string {
  return value.includes(DST) ? value.replace(DSTP, DSTR) : value;
}

// 3-2. Sanitize JSON value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function sanitizeJson(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const sanitized = value.map((item) => {
      const nextItem = sanitizeJson(item);
      changed ||= nextItem !== item;
      return nextItem;
    });

    return changed ? sanitized : value;
  }
  if (typeof value === "object" && value !== null) {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      const nextItem = sanitizeJson(item);
      changed ||= nextItem !== item;
      return [key, nextItem];
    });

    return changed ? Object.fromEntries(entries) : value;
  }
  return value;
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
// Compact envelope keeps data.content as the single full-text source; data.text is only added
// when FS_MCP_COMPACT is disabled to restore the duplicated combined-text field.
function createStandardOutput(toolName: string, result: ServerResult, content: SrvrResCont[], durationMs?: number): StandardToolOutput {
  const status: ToolResultStatus = result.isError === true ? "error" : "success";
  const strcCont = sanitizeJson(result.structuredContent ?? null) as ServerResult["structuredContent"] | null;
  const data: StandardToolOutput["data"] = {
    content,
    structuredContent: strcCont,
  };

  if (!CMPC_ENVL) {
    data.text = createCombinedText(content);
  }
  const stndOtpt: StandardToolOutput = {
    data,
    durationMs: durationMs ?? null,
    error: createErrorDetails(status, content),
    schemaVersion: 1,
    status,
    toolName,
  };

  return stndOtpt;
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
    (data.text === undefined || typeof data.text === "string") &&
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
    content: [{ text: sanitizeText(text), type: "text" }],
  };

  if (options.structuredContent !== undefined) {
    response.structuredContent = sanitizeJson(options.structuredContent) as ServerResult["structuredContent"];
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
    const prevOutput = result.structuredContent as StandardToolOutput;
    const output = sanitizeJson({
      ...prevOutput,
      durationMs: durationMs ?? prevOutput.durationMs,
    }) as StandardToolOutput;
    const fsMcpResult = result._meta?.fsMcpResult;
    const nextMeta = typeof fsMcpResult === "object" && fsMcpResult !== null
      ? {
        ...result._meta,
        fsMcpResult: {
          ...fsMcpResult,
          durationMs: output.durationMs,
        },
      }
      : result._meta;

    return {
      ...result,
      _meta: nextMeta,
      content: [{ text: crtTlDsplTxt(output), type: "text" }],
      structuredContent: output,
    };
  }
  const origCont = normalizeContent(result.content);
  const fsMcpResult = createResultMetadata(toolName, result, origCont, durationMs);
  const origOtpt = createStandardOutput(toolName, result, origCont, durationMs);
  const stndOtpt = sanitizeJson(origOtpt) as StandardToolOutput;
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
