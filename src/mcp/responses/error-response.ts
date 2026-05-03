/**
 * @file src/mcp/responses/error-response.ts
 * @description MCP error response helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { capture } from "@app/runtime/output-capture";
import { createToolErrorResponse } from "@mcp/responses/tool-result-response";
import type { ServerResult } from "@type/common-types";

/**
 * Creates a standard error response for tools
 * @param message The error message
 * @returns A ServerResult with the error message
 */
export function createErrorResponse(message: string): ServerResult {
  capture("server_request_error", {
    error: message,
  });
  return createToolErrorResponse(message);
}
