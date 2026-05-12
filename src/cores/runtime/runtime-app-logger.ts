/**
 * @file src/cores/runtime/runtime-app-logger.ts
 * @description Application logging utilities.
 * @author JUNGHO
 * @since 2026-05-02
 */

// Centralized logging utility for fs-mcp
// Ensures all logging goes through proper channels based on initialization state

import type { FilteredStdioServerTransport } from "@cores/transport/transport-stdio-transport";

// Global reference to the MCP transport (set in bootstrap.ts)
declare global {
  var mcpTransport: FilteredStdioServerTransport | undefined;
}

export type LogLevel = "emergency" | "alert" | "critical" | "error" | "warning" | "notice" | "info" | "debug";

// 1. Is structured log data ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isStructuredLogData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 2. Create log payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createLogPayload(message: string, data?: unknown): string | Record<string, unknown> {
  if (data === undefined) {
    return message;
  }

  if (isStructuredLogData(data)) {
    return { message, ...data };
  }

  return { data, message };
}

// 3. Create stderr fallback message ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createStderrFallbackMessage(level: LogLevel, message: string, data?: unknown): string {
  let suffix = "";

  if (data !== undefined) {
    try {
      suffix = ` ${JSON.stringify(createLogPayload(message, data))}`;
    }
    catch {
      suffix = ` ${String(data)}`;
    }
  }
  return `[fs-mcp][${level}] ${message}${suffix}\n`;
}

// 4. Log ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function log(level: LogLevel, message: string, data?: unknown): void {
  try {
    if (global.mcpTransport) {
      global.mcpTransport.sendLog(level, message, data);
    }
    else {
      process.stderr.write(createStderrFallbackMessage(level, message, data));
    }
  }
  catch (_error) {
    process.stderr.write(createStderrFallbackMessage("error", `Failed to log message: ${message}`));
  }
}

// Convenience functions for different log levels
export const logger: Readonly<Record<LogLevel, (message: string, data?: unknown) => void>> = {
  alert: (message: string, data?: unknown) => log("alert", message, data),
  critical: (message: string, data?: unknown) => log("critical", message, data),
  debug: (message: string, data?: unknown) => log("debug", message, data),
  emergency: (message: string, data?: unknown) => log("emergency", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
  info: (message: string, data?: unknown) => log("info", message, data),
  notice: (message: string, data?: unknown) => log("notice", message, data),
  warning: (message: string, data?: unknown) => log("warning", message, data),
};

// 2. Log to stderr during early initialization (before MCP is ready) ――――――――――――――――――――――――――――――
// Use this for critical startup messages that must be visible
// NOTE: This should also be JSON-RPC format

// 5. Log to stderr ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function logToStderr(level: LogLevel, message: string): void {
  process.stderr.write(createStderrFallbackMessage(level, message));
}
