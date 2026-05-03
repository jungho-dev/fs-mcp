/**
 * @file src/app/server/create-mcp-server.ts
 * @description MCP server creation and tool routing.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { type LogLevel, logger, logToStderr } from "@app/runtime/app-logger";
import { capture } from "@app/runtime/output-capture";
import { VERSION } from "@app/runtime/version";
import { createErrorResponse } from "@mcp/responses/error-response";
import { normalizeToolResult } from "@mcp/responses/tool-result-response";
import { createToolCatalog, dispatchToolCall } from "@mcp/tools/tool-exports";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
  type InitializeRequest,
  InitializeRequestSchema,
  LATEST_PROTOCOL_VERSION,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerResult } from "@type/common-types";

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

const deferredMessages: Array<{ level: LogLevel; message: string }> = [];

function deferLog(level: LogLevel, message: string): void {
  deferredMessages.push({ level, message });
}
function hasRequestMetadata(value: unknown): value is RequestMetadata {
  return typeof value === "object" && value !== null;
}
// Function to flush deferred messages after initialization
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
      tools: {},
      resources: {},
      logging: {}, // Add logging capability for console redirection
    },
  },
);

// Store current client info (simple variable)
let currentClient: CurrentClient = { name: "uninitialized", version: "uninitialized" };

/**
 * Unified way to update client information
 */
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
      protocolVersion,
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
      serverInfo: {
        name: "fs-mcp",
        version: VERSION,
      },
    };
  } catch (error) {
    logToStderr("error", `Error in initialization handler: ${error}`);
    throw error;
  }
});

// Export current client info for access by other modules
export { currentClient };

deferLog("info", "Setting up request handlers...");

server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    // logToStderr('debug', 'Generating tools list...');

    return {
      tools: createToolCatalog(),
    };
  } catch (error) {
    logToStderr("error", `Error in list_tools request handler: ${error}`);
    throw error;
  }
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<ServerResult> => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    const metadata = request.params._meta;
    if (hasRequestMetadata(metadata) && metadata.clientInfo) {
      await updateCurrentClient(metadata.clientInfo);
    }
    const result = await dispatchToolCall(name, args);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    const errorResult = createErrorResponse(errorMessage);

    return normalizeToolResult(name, errorResult, duration);
  }
});

// Add no-op handlers so Visual Studio initialization succeeds
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
