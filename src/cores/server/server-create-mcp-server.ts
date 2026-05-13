/**
 * @file src/cores/server/server-create-mcp-server.ts
 * @description MCP server creation and tool routing.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResult} from "@assets/type/common";
import {createErrorResponse} from "@cores/responses/responses-error";
import {normalizeToolResult} from "@cores/responses/responses-tool-result";
import {type LogLevel, logger, logToStderr} from "@cores/runtime/runtime-app-logger";
import {SERVER_INSTRUCTIONS} from "@cores/server/server-instructions";
import {buildCurrentClientSessionKey, type ClientInfoUpdate, currentClient, updateCurrentClient} from "@features/config/config-client";
import {PACKAGE_VERSION} from "@features/config/config-store";
import {runWithGitSessionScope} from "@features/git/git-session";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {type CallToolRequest, CallToolRequestSchema, type InitializeRequest, InitializeRequestSchema, LATEST_PROTOCOL_VERSION, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, SUPPORTED_PROTOCOL_VERSIONS} from "@modelcontextprotocol/sdk/types.js";
import {CONFIG_TOOL_CATALOG} from "@tools/tools-config";
import type {ToolCatalogEntry} from "@tools/tools-const";
import {dispatchToolCall} from "@tools/tools-dispatcher";
import {FILESYSTEM_TOOL_CATALOG} from "@tools/tools-filesystem";
import {GIT_TOOL_CATALOG} from "@tools/tools-git";
import {PROCESS_TOOL_CATALOG} from "@tools/tools-process";

type RequestMetadata = {
  clientInfo?: ClientInfoUpdate;
};

const deferredMessages: Array<{level: LogLevel; message: string}> = [];

// 1. Defer log ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function deferLog(level: LogLevel, message: string): void {
  deferredMessages.push({level, message});
}

// 2. Has request metadata ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function hasRequestMetadata(value: unknown): value is RequestMetadata {
  return typeof value === "object" && value !== null;
}

// 3. Create tool catalog ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createToolCatalog(): ToolCatalogEntry[] {
  return [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG, ...GIT_TOOL_CATALOG];
}

const TOOL_CATALOG = createToolCatalog();

// Function to flush deferred messages after initialization

// 4. Flush deferred messages ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function flushDeferredMessages(): void {
  while (deferredMessages.length > 0) {
    const msg = deferredMessages.shift();
    if (!msg) {
      continue;
    }
    logger[msg.level](msg.message);
  }
}
deferLog("info", "Loading create-mcp-server.ts");

export const server = new Server(
  {
    name: "fs-mcp",
    version: PACKAGE_VERSION,
  },
  {
    capabilities: {
      logging: {}, // Add logging capability for console redirection
      resources: {},
      tools: {},
    },
    instructions: SERVER_INSTRUCTIONS,
  },
);

// 5. Update current client ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function applyCurrentClientUpdate(clientInfo: ClientInfoUpdate): void {
  const clientUpdate = updateCurrentClient(clientInfo);

  if (clientUpdate.nameChanged) {
    const transport = globalThis.mcpTransport;
    if (transport && typeof transport.configureForClient === "function") {
      transport.configureForClient(currentClient.name);
    }
  }
}

// Add handler for initialization method - capture client info
server.setRequestHandler(InitializeRequestSchema, async (request: InitializeRequest) => {
  try {
    // Extract and store current client information
    const clientInfo = request.params?.clientInfo;
    if (clientInfo) {
      applyCurrentClientUpdate(clientInfo);
    }
    // Negotiate protocol version with client
    const requestedVersion = request.params?.protocolVersion;
    const protocolVersion = requestedVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion) ? requestedVersion : LATEST_PROTOCOL_VERSION;

    // Return standard initialization response
    return {
      capabilities: {
        logging: {},
        resources: {},
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
      protocolVersion,
      serverInfo: {
        name: "fs-mcp",
        version: PACKAGE_VERSION,
      },
    };
  }
  catch (error) {
    logToStderr("error", `Error in initialization handler: ${error}`);
    throw error;
  }
});

deferLog("info", "Setting up request ..");

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    return {
      tools: TOOL_CATALOG,
    };
  }
  catch (error) {
    logToStderr("error", `Error in list_tools request handler: ${error}`);
    throw error;
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<ServerResult> => {
  const {name, arguments: args} = request.params;
  const startTime = Date.now();

  try {
    const metadata = request.params._meta;
    if (hasRequestMetadata(metadata) && metadata.clientInfo) {
      applyCurrentClientUpdate(metadata.clientInfo);
    }
    const result = await runWithGitSessionScope(buildCurrentClientSessionKey(), async () => await dispatchToolCall(name, args));
    return result;
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    const errorResult = createErrorResponse(errorMessage);

    return normalizeToolResult(name, errorResult, duration);
  }
});

// Add no-op handlers so Visual Studio initialization succeeds
server.setRequestHandler(ListResourcesRequestSchema, async () => ({resources: []}));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({resourceTemplates: []}));
