/**
 * @file src/cores/responses/responses-error.ts
 * @description MCP error response helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createToolErrorResponse } from "@cores/responses/responses-tool-result";

// 1. Creates a standard error response for tools ――――――――――――――――――――――――――――――――――――――――――――――――――
// @param message The error message
// @returns A ServerResult with the error message

// 1. Create error response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createErrorResponse(message: string): ServerResult {
  return createToolErrorResponse(message);
}
