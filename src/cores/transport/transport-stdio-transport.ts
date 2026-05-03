/**
 * @file src/cores/transport/transport-stdio-transport.ts
 * @description Filtered stdio transport.
 * @author JUNGHO
 * @since 2026-05-02
 */

import process from "node:process";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";

const TRAILING_NEWLINE_REGEX = /\n$/;
type LogLevel = LogNotification["params"]["level"];
type StdoutWriteCallback = (error?: Error | null) => void;

interface LogNotification {
  jsonrpc: "2.0";
  method: "notifications/message";
  params: {
    level: "emergency" | "alert" | "critical" | "error" | "warning" | "notice" | "info" | "debug";
    logger?: string;
    data: unknown;
  };
}
function isStructuredLogData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function createLogPayload(message: string, data?: unknown): string | Record<string, unknown> {
  if (data === undefined) {
  	return message;
  }
  if (isStructuredLogData(data)) {
    return {message, ...data};
  }
  return {data, message};
}
function formatLogArgument(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value, null, 2);
    }
    catch {
      return String(value);
    }
  }
  return String(value);
}
function writeToStdout(write: typeof process.stdout.write, chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | StdoutWriteCallback, callback?: StdoutWriteCallback): boolean {
  const writeArgs = callback !== undefined ? [chunk, encodingOrCallback, callback] : encodingOrCallback !== undefined ? [chunk, encodingOrCallback] : [chunk];
  return Reflect.apply(write, process.stdout, writeArgs) as boolean;
}
/**
 * Enhanced StdioServerTransport that wraps console output in valid JSON-RPC structures
 * instead of filtering them out. This prevents crashes while maintaining debug visibility.
 */
export class FilteredStdioServerTransport extends StdioServerTransport {
  private readonly originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    info: typeof console.info;
  };
  private readonly originalStdoutWrite: typeof process.stdout.write;
  private isInitialized: boolean = false;
  private messageBuffer: Array<{
    level: "emergency" | "alert" | "critical" | "error" | "warning" | "notice" | "info" | "debug";
    args: unknown[];
    timestamp: number;
  }> = [];
  private clientName: string = "unknown";
  private disableNotifications: boolean = false;

  constructor() {
    super();

    // Store original methods
    this.originalConsole = {
      debug: console.debug,
      error: console.error,
      info: console.info,
      log: console.log,
      warn: console.warn,
    };

    this.originalStdoutWrite = process.stdout.write;

    // Setup console redirection
    this.setupConsoleRedirection();

    // Setup stdout filtering for any other output
    this.setupStdoutFiltering();

    // Note: We defer the initialization notification until enableNotifications() is called
    // to ensure MCP protocol compliance - notifications must not be sent before initialization
  }
  /**
   * Call this method after MCP initialization is complete to enable JSON-RPC notifications
   */
  public enableNotifications(): void {
    this.isInitialized = true;

    // Check if notifications should be disabled based on client
    if (this.disableNotifications) {
      // Clear buffer without sending - just log to stderr instead
      if (this.messageBuffer.length > 0) {
        process.stderr.write(`${this.messageBuffer.length} buffered messages suppressed for ${this.clientName}\n`);
      }
      this.messageBuffer = [];
      return;
    }
    // Send the deferred initialization notification first
    this.sendLogNotification("info", ["Enhanced FilteredStdioServerTransport initialized"]);

    // Replay all buffered messages in chronological order
    if (this.messageBuffer.length > 0) {
      this.sendLogNotification("info", [`Replaying ${this.messageBuffer.length} buffered initialization messages`]);

      this.messageBuffer
        .sort((a, b) => a.timestamp - b.timestamp)
        .forEach((msg) => {
          this.sendLogNotification(msg.level, msg.args);
        });

      // Clear the buffer
      this.messageBuffer = [];
    }
    this.sendLogNotification("info", ["JSON-RPC notifications enabled"]);
  }
  /**
   * Configure client-specific behavior
   * Call this BEFORE enableNotifications()
   */
  public configureForClient(clientName: string): void {
    this.clientName = clientName.toLowerCase();

    // Detect Cline and disable notifications
    if (this.clientName.includes("cline") || this.clientName.includes("vscode") || this.clientName === "claude-dev") {
      this.disableNotifications = true;
      process.stderr.write(`fs-mcp: Notifications disabled for ${clientName}\n`);
    }
  }
  /**
   * Check if notifications are enabled
   */
  public get isNotificationsEnabled(): boolean {
    return this.isInitialized;
  }
  /**
   * Get the current count of buffered messages
   */
  public get bufferedMessageCount(): number {
    return this.messageBuffer.length;
  }
  private setupConsoleRedirection(): void {
    console.log = (...args: unknown[]) => {
      if (this.isInitialized) {
      	this.sendLogNotification("info", args);
      }
      else {
        // Buffer for later replay to client
        this.messageBuffer.push({
          args,
          level: "info",
          timestamp: Date.now(),
        });
      }
    };

    console.info = (...args: unknown[]) => {
      if (this.isInitialized) {
      	this.sendLogNotification("info", args);
      }
      else {
        this.messageBuffer.push({
          args,
          level: "info",
          timestamp: Date.now(),
        });
      }
    };

    console.warn = (...args: unknown[]) => {
      if (this.isInitialized) {
      	this.sendLogNotification("warning", args);
      }
      else {
        this.messageBuffer.push({
          args,
          level: "warning",
          timestamp: Date.now(),
        });
      }
    };

    console.error = (...args: unknown[]) => {
      if (this.isInitialized) {
      	this.sendLogNotification("error", args);
      }
      else {
        this.messageBuffer.push({
          args,
          level: "error",
          timestamp: Date.now(),
        });
      }
    };

    console.debug = (...args: unknown[]) => {
      if (this.isInitialized) {
      	this.sendLogNotification("debug", args);
      }
      else {
        this.messageBuffer.push({
          args,
          level: "debug",
          timestamp: Date.now(),
        });
      }
    };
  }
  private setupStdoutFiltering(): void {
    process.stdout.write = (buffer: string | Uint8Array, encodingOrCallback?: BufferEncoding | StdoutWriteCallback, callback?: StdoutWriteCallback): boolean => {
      const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      const resolvedCallback = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

      // Handle different call signatures
      if (typeof buffer === "string") {
        const trimmed = buffer.trim();

        // Check if this looks like a valid JSON-RPC message
        if (trimmed.startsWith("{") && (trimmed.includes('"jsonrpc"') || trimmed.includes('"method"') || trimmed.includes('"id"'))) {
        	// This looks like a valid JSON-RPC message, allow it
          return writeToStdout(this.originalStdoutWrite, buffer, encoding, resolvedCallback);
        }
        else if (trimmed.length > 0) {
          // Non-JSON-RPC output, wrap it in a log notification
          if (this.isInitialized) {
          	this.sendLogNotification("info", [buffer.replace(TRAILING_NEWLINE_REGEX, "")]);
          }
          else {
            // Buffer for later replay to client
            this.messageBuffer.push({
              args: [buffer.replace(TRAILING_NEWLINE_REGEX, "")],
              level: "info",
              timestamp: Date.now(),
            });
          }
          if (resolvedCallback) {
          	resolvedCallback();
          }
          return true;
        }
      }
      // For non-string buffers or empty strings, let them through
      return writeToStdout(this.originalStdoutWrite, buffer, encoding, resolvedCallback);
    };
  }
  private sendLogNotification(level: LogLevel, args: unknown[]): void {
    // Skip if notifications are disabled (e.g., for Cline)
    if (this.disableNotifications) {
    	return;
    }
    try {
      // For data, we can send structured data or string according to MCP spec
      let data: unknown;
      if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
      	// Single object - send as structured data
        data = args[0];
      }
      else {
      	// Multiple args or primitives - convert to string
        data = args.map((arg) => formatLogArgument(arg)).join(" ");
      }
      const notification: LogNotification = {
        jsonrpc: "2.0",
        method: "notifications/message",
        params: {
          data,
          level,
          logger: "fs-mcp",
        },
      };

      // Send as valid JSON-RPC notification
      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(notification)}\n`);
    }
    catch (_error) {
      // Fallback to a simple JSON-RPC error notification if JSON serialization fails
      const fallbackNotification = {
        jsonrpc: "2.0" as const,
        method: "notifications/message",
        params: {
          data: `Log serialization failed: ${args.join(" ")}`,
          level: "error",
          logger: "fs-mcp",
        },
      };
      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(fallbackNotification)}\n`);
    }
  }
  /**
   * Public method to send log notifications from anywhere in the application
   * Now properly buffers messages before MCP initialization to avoid breaking stdio protocol
   */
  public sendLog(level: LogLevel, message: string, data?: unknown): void {
    // Skip if notifications are disabled (e.g., for Cline)
    if (this.disableNotifications) {
    	return;
    }
    // Buffer messages before initialization to avoid breaking MCP protocol
    // MCP requires client to send first message - server cannot write to stdout before that
    if (!this.isInitialized) {
      this.messageBuffer.push({
        args: [createLogPayload(message, data)],
        level,
        timestamp: Date.now(),
      });
      return;
    }
    try {
      const notification: LogNotification = {
        jsonrpc: "2.0",
        method: "notifications/message",
        params: {
          data: createLogPayload(message, data),
          level,
          logger: "fs-mcp",
        },
      };

      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(notification)}\n`);
    }
    catch (_error) {
      // Fallback to basic JSON-RPC notification
      const fallbackNotification = {
        jsonrpc: "2.0" as const,
        method: "notifications/message",
        params: {
          data: `sendLog failed: ${message}`,
          level: "error",
          logger: "fs-mcp",
        },
      };
      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(fallbackNotification)}\n`);
    }
  }
  /**
   * Send a progress notification (useful for long-running operations)
   */
  public sendProgress(token: string, value: number, total?: number): void {
    // Don't send progress before initialization - would break MCP protocol
    if (!this.isInitialized) {
    	return;
    }
    try {
      const notification = {
        jsonrpc: "2.0" as const,
        method: "notifications/progress",
        params: {
          progressToken: token,
          value,
          ...(total && {total}),
        },
      };

      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(notification)}\n`);
    }
    catch (_error) {
      // Fallback to basic JSON-RPC notification for progress
      const fallbackNotification = {
        jsonrpc: "2.0" as const,
        method: "notifications/message",
        params: {
          data: `Progress ${token}: ${value}${total ? `/${total}` : ""}`,
          level: "info",
          logger: "fs-mcp",
        },
      };
      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(fallbackNotification)}\n`);
    }
  }
  /**
   * Send a custom notification with any method name
   */
  public sendCustomNotification(method: string, params: unknown): void {
    // Don't send custom notifications before initialization - would break MCP protocol
    if (!this.isInitialized) {
    	return;
    }
    try {
      const notification = {
        jsonrpc: "2.0" as const,
        method,
        params,
      };

      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(notification)}\n`);
    }
    catch (_error) {
      // Fallback to basic JSON-RPC notification for custom notifications
      const fallbackNotification = {
        jsonrpc: "2.0" as const,
        method: "notifications/message",
        params: {
          data: `Custom notification failed: ${method}: ${JSON.stringify(params)}`,
          level: "error",
          logger: "fs-mcp",
        },
      };
      writeToStdout(this.originalStdoutWrite, `${JSON.stringify(fallbackNotification)}\n`);
    }
  }
  /**
   * Cleanup method to restore original console methods if needed
   */
  public cleanup(): void {
    if (this.originalConsole) {
    	console.log = this.originalConsole.log;
      console.warn = this.originalConsole.warn;
      console.error = this.originalConsole.error;
      console.debug = this.originalConsole.debug;
      console.info = this.originalConsole.info;
    }
    if (this.originalStdoutWrite) {
    	process.stdout.write = this.originalStdoutWrite;
    }
  }
}
