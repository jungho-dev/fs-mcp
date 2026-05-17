/**
 * @file src/cores/runtime/runtime-app-logger.ts
 * @description Application logging utilities.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type { FilteredStdioServerTransport as FltStSrTr } from "@cores/transport/transport-stdio-transport";

declare global {
  var mcpTransport: FltStSrTr | undefined;
}

export declare type LogLevel = "emergency" | "alert" | "critical" | "error" | "warning" | "notice" | "info" | "debug";

const LOG_CONFIG = {
  "line": {
    "str": `―――――――――――――――――――――――――――――――――――――――――`,
    "color": `\u001B[38;2;255;162;0m`,
  },
  "debug": {
    "str": `[D]`,
    "color": `\u001B[38;5;141m`,
  },
  "info": {
    "str": `[I]`,
    "color": `\u001B[38;5;111m`,
  },
  "warn": {
    "str": `[W]`,
    "color": `\u001B[38;5;220m`,
  },
  "error": {
    "str": `[E]`,
    "color": `\u001B[38;5;196m`,
  },
  "reset": {
    "str": ``,
    "color": `\u001B[0m`,
  },
} as const;

type DisplayLevel = "debug" | "info" | "warn" | "error";

// 1. Display level resolve ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function resolveDisplayLevel(level: LogLevel): DisplayLevel {
  if (level === "debug") {
    return "debug";
  }
  if (level === "info" || level === "notice") {
    return "info";
  }
  if (level === "warning") {
    return "warn";
  }
  return "error";
}

// 2. Is structured log data ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function isStructuredLogData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 3. Create log payload ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createLogPayload(message: string, data?: unknown): string | Record<string, unknown> {
  if (data === undefined) {
    return message;
  }

  if (isStructuredLogData(data)) {
    return { message, ...data };
  }

  return { data, message };
}

// 4. Format fallback data ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatFallbackData(message: string, data?: unknown): string {
  if (data === undefined) {
    return "";
  }

  try {
    return ` ${JSON.stringify(createLogPayload(message, data))}`;
  }
  catch {
    return ` ${String(data)}`;
  }
}

// 5. Create stderr fallback message ―――――――――――――――――――――――――――――――――――――――――――――
function createStderrFallbackMessage(level: LogLevel, message: string, data?: unknown): string {
  const displayLevel = resolveDisplayLevel(level);
  const cfg = LOG_CONFIG[displayLevel];
  const prefix = `${cfg.color}${cfg.str}${LOG_CONFIG.reset.color}`;
  const text = `${cfg.color}${message}${LOG_CONFIG.reset.color}`;
  return `${prefix} ${text}${formatFallbackData(message, data)}\n`;
}

// 6. Log ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 7. Log to stderr ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function logToStderr(level: LogLevel, message: string): void {
  process.stderr.write(createStderrFallbackMessage(level, message));
}
