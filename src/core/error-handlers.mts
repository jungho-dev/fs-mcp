import type { ServerResult } from '../types/index.mjs';
import {capture} from "../utils/capture.mjs";

/**
 * Creates a standard error response for tools
 * @param message The error message
 * @returns A ServerResult with the error message
 */
export function createErrorResponse(message: string): ServerResult {
  capture('server_request_error', {
    error: message
  });
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
