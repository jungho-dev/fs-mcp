/**
 * @file src/cores/responses/responses-error.ts
 * @description MCP error response helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { ServerResult } from "@assets/type/common";
import { createToolErrorResponse as crtTlErrRes } from "@cores/responses/responses-tool-result";

// 1. Creates a standard error response for tools ――――――――――――――――――――――――――――――――――――――――――――――――――

// 1. Create error response ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createErrorResponse(message: string): ServerResult {
  return crtTlErrRes(message);
}
