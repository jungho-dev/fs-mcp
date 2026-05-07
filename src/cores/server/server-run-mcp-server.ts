/**
 * @file src/cores/server/server-run-mcp-server.ts
 * @description MCP server runtime bootstrap and fatal error handling.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {type LogLevel, logger} from "@cores/runtime/runtime-app-logger";
import {flushDeferredMessages, server} from "@cores/server/server-create-mcp-server";
import {FilteredStdioServerTransport} from "@cores/transport/transport-stdio-transport";
import {configManager} from "@features/config/config-store";

type DeferredStartupMessage = {
  level: LogLevel;
  message: string;
};

const deferredMessages: DeferredStartupMessage[] = [];

// 1. Defer log ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function deferLog(level: LogLevel, message: string): void {
  deferredMessages.push({level, message});
}

// 2. Flush startup logs ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function flushStartupLogs(transport: Pick<FilteredStdioServerTransport, "sendLog">, messages: DeferredStartupMessage[]): DeferredStartupMessage[] {
  const sentMessages: DeferredStartupMessage[] = [];
  while (messages.length > 0) {
    const message = messages.shift();
    if (!message) {
      continue;
    }
    transport.sendLog(message.level, message.message);
    sentMessages.push(message);
  }
  return sentMessages;
}

// 3. Is protocol JSON parse error ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isProtocolJsonParseError(errorMessage: string): boolean {
  return errorMessage.includes("JSON") && errorMessage.includes("Unexpected token");
}

// 4. Handle fatal process error ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function handleFatalProcessError(captureKey: string, label: string, errorMessage: string): void {
  logger.error(`${label}: ${errorMessage}`);
  process.exit(1);
}

// 5. Run server ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runServer () {
  try {
    // Create transport FIRST so all logging gets properly buffered
    // This must happen before any code that might use logger.*
    const transport = new FilteredStdioServerTransport();

    // Export transport for use throughout the application
    global.mcpTransport = transport;

    try {
      deferLog("info", "Loading configuration...");
      await configManager.loadConfig();
      deferLog("info", "Configuration loaded successfully");
    }
    catch (configError) {
      deferLog("error", `Failed to load configuration: ${configError instanceof Error ? configError.message : String(configError)}`);
      if (configError instanceof Error && configError.stack) {
        deferLog("debug", `Stack trace: ${configError.stack}`);
      }
      deferLog("warning", "Continuing with in-memory configuration only");
      // Continue anyway - we'll use an in-memory config
    }
    process.on("uncaughtException", async (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      handleFatalProcessError("run_server_uncaught_exception", isProtocolJsonParseError(errorMessage) ? "Fatal JSON parsing error" : "Uncaught exception", errorMessage);
    });

    process.on("unhandledRejection", async (reason) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      handleFatalProcessError("run_server_unhandled_rejection", isProtocolJsonParseError(errorMessage) ? "Fatal JSON parsing rejection" : "Unhandled rejection", errorMessage);
    });


    deferLog("info", "Connecting server...");

    server.oninitialized = () => {
      // This callback is triggered after the client sends the "initialized" notification
      // At this point, the MCP protocol handshake is fully complete
      transport.enableNotifications();

      flushStartupLogs(transport, deferredMessages);
      flushDeferredMessages();

      transport.sendLog("info", "Server connected successfully");
      transport.sendLog("info", "MCP fully initialized, all startup messages sent");
    };

    await server.connect(transport);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`FATAL ERROR: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }
    const errorNotification = {
      jsonrpc: "2.0" as const,
      method: "notifications/message",
      params: {
        data: `Failed to start server: ${errorMessage} (${new Date().toISOString()})`,
        level: "error",
        logger: "fs-mcp",
      },
    };
    process.stdout.write(`${JSON.stringify(errorNotification)}\n`);

    process.exit(1);
  }
}

// 4. Start server ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function startServer () {
  void runServer().catch(async (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`RUNTIME ERROR: ${errorMessage}`);
    console.error(error instanceof Error && error.stack ? error.stack : "No stack trace available");
    process.stderr.write(
      `${JSON.stringify({
        message: `Fatal error running server: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        type: "error",
      })}\n`,
    );

    process.exit(1);
  });
}
