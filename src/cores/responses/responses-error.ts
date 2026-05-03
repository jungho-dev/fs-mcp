/**
 * @file src/cores/responses/responses-error.ts
 * @description MCP error response helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createToolErrorResponse } from "@cores/responses/responses-tool-result";
import { capture } from "@cores/runtime/runtime-output-capture";

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
