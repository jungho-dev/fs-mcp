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
import {capture} from "@cores/runtime/runtime-output-capture";
import {VERSION} from "@cores/runtime/runtime-version";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {type CallToolRequest, CallToolRequestSchema, type InitializeRequest, InitializeRequestSchema, LATEST_PROTOCOL_VERSION, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, SUPPORTED_PROTOCOL_VERSIONS} from "@modelcontextprotocol/sdk/types.js";
import {CONFIG_TOOL_CATALOG} from "@tools/tools-config";
import type {ToolCatalogEntry} from "@tools/tools-const";
import {dispatchToolCall} from "@tools/tools-dispatcher";
import {FILESYSTEM_TOOL_CATALOG} from "@tools/tools-filesystem";
import {GIT_TOOL_CATALOG} from "@tools/tools-git";
import {PROCESS_TOOL_CATALOG} from "@tools/tools-process";

// Store startup messages to send after initialization
type CurrentClient = {
  name: string;
  version: string;
};

type ClientInfoUpdate = {
  name?: string;
  version?: string;
};

type RequestMetadata = {
  clientInfo?: ClientInfoUpdate;
};

const deferredMessages: Array<{level: LogLevel; message: string}> = [];

// 1. Defer log ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function deferLog(level: LogLevel, message: string): void {
  deferredMessages.push({level, message});
}
// 2. Has request metadata ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function hasRequestMetadata(value: unknown): value is RequestMetadata {
  return typeof value === "object" && value !== null;
}

// Function to flush deferred messages after initialization
// 3. Flush deferred messages ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
    version: VERSION,
  },
  {
    capabilities: {
      logging: {}, // Add logging capability for console redirection
      resources: {},
      tools: {},
    },
  },
);

// Store current client info (simple variable)
let currentClient: CurrentClient = {name: "uninitialized", version: "uninitialized"};

// 4. Update current client ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function updateCurrentClient(clientInfo: ClientInfoUpdate): Promise<boolean> {
  if (clientInfo.name !== currentClient.name || clientInfo.version !== currentClient.version) {
    const nameChanged = clientInfo.name !== currentClient.name;

    currentClient = {
      name: clientInfo.name ?? currentClient.name,
      version: clientInfo.version ?? currentClient.version,
    };

    // Configure transport for client-specific behavior only if name changed
    if (nameChanged) {
      const transport = globalThis.mcpTransport;
      if (transport && typeof transport.configureForClient === "function") {
      	transport.configureForClient(currentClient.name);
      }
    }
    return true;
  }
  return false;
}

// Add handler for initialization method - capture client info
server.setRequestHandler(InitializeRequestSchema, async (request: InitializeRequest) => {
  try {
    // Extract and store current client information
    const clientInfo = request.params?.clientInfo;
    if (clientInfo) {
    	await updateCurrentClient(clientInfo);
    }
    capture("run_server_mcp_initialized");

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
      protocolVersion,
      serverInfo: {
        name: "fs-mcp",
        version: VERSION,
      },
    };
  }
  catch (error) {
    logToStderr("error", `Error in initialization handler: ${error}`);
    throw error;
  }
});

// Export current client info for access by other modules
export {currentClient};

deferLog("info", "Setting up request ..");

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // 5. Create tool catalog ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  function createToolCatalog(): ToolCatalogEntry[] {
    return [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG, ...GIT_TOOL_CATALOG];
  }
  try {
    return {
      tools: createToolCatalog(),
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
    	await updateCurrentClient(metadata.clientInfo);
    }
    const result = await dispatchToolCall(name, args);
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
