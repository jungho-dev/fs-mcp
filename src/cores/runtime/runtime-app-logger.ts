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

function isStructuredLogData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createLogPayload(message: string, data?: unknown): string | Record<string, unknown> {
  if (data === undefined) {
    return message;
  }

  if (isStructuredLogData(data)) {
    return { message, ...data };
  }

  return { data, message };
}

// 1. Log a message using the appropriate method based on MCP initialization state ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function log(level: LogLevel, message: string, data?: unknown): void {
  try {
    // Check if MCP transport is available
    if (global.mcpTransport) {
      // Always use MCP logging (will buffer if not initialized yet)
      global.mcpTransport.sendLog(level, message, data);
    } else {
      // This should rarely happen, but fallback to create a JSON-RPC notification manually
      const notification = {
        jsonrpc: "2.0" as const,
        method: "notifications/message",
        params: {
          data: createLogPayload(message, data),
          level,
          logger: "fs-mcp",
        },
      };
      process.stdout.write(`${JSON.stringify(notification)}\n`);
    }
  } catch (_error) {
    // Ultimate fallback - but this should be JSON-RPC too
    const notification = {
      jsonrpc: "2.0" as const,
      method: "notifications/message",
      params: {
        data: `Failed to log message: ${message}`,
        level: "error",
        logger: "fs-mcp",
      },
    };
    process.stdout.write(`${JSON.stringify(notification)}\n`);
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

// 2. Log to stderr during early initialization (before MCP is ready) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Use this for critical startup messages that must be visible
// NOTE: This should also be JSON-RPC format
export function logToStderr(level: LogLevel, message: string): void {
  const notification = {
      jsonrpc: "2.0" as const,
      method: "notifications/message",
      params: {
        data: message,
        level,
        logger: "fs-mcp",
      },
  };
  process.stdout.write(`${JSON.stringify(notification)}\n`);
}
