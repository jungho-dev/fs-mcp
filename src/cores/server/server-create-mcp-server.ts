/**
 * @file src/cores/server/server-create-mcp-server.ts
 * @description MCP server creation and tool routing.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ServerResult} from "@assets/type/common";
import {createErrorResponse as crtErrRes} from "@cores/responses/responses-error";
import {normalizeToolResult as nrmlTlRes} from "@cores/responses/responses-tool-result";
import {type LogLevel, logger, logToStderr} from "@cores/runtime/runtime-app-logger";
import {SRVR_INST} from "@cores/server/server-instructions";
import {buildCurrentClientSessionKey as bldCuClSeKy, type ClientInfoUpdate as ClntInfUpdt, curClnt, updateCurrentClient as updtCurClnt} from "@features/config/config-client";
import {PCKG_VRSN} from "@features/config/config-store";
import {runWithGitSessionScope as rnWtGtSeSc} from "@features/git/git-session";
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {type CallToolRequest as CllTlReq, CallToolRequestSchema as CllTlReqSch, type InitializeRequest as IntlReq, InitializeRequestSchema as IntlReqSch, ListResourcesRequestSchema as LstReReSc, ListResourceTemplatesRequestSchema as LstReTmReSc, ListToolsRequestSchema as LstTlsReqSch, LATEST_PROTOCOL_VERSION as LTS_PRT_VRS, SUPPORTED_PROTOCOL_VERSIONS as SUP_PRT_VRS} from "@modelcontextprotocol/sdk/types.js";
import {CFG_TL_CTLG} from "@tools/tools-config";
import type {ToolCatalogEntry as TlCtlgEntr} from "@tools/tools-const";
import {dispatchToolCall as dsptTlCll} from "@tools/tools-dispatcher";
import {FLSY_TL_CTLG} from "@tools/tools-filesystem";
import {GT_TL_CTLG} from "@tools/tools-git";
import {PROC_TL_CTLG} from "@tools/tools-process";
import {WEB_TL_CTLG} from "@tools/tools-web";

type RequestMetadata = {
  clientInfo?: ClntInfUpdt;
};

const dfrrMsgs: Array<{level: LogLevel; message: string}> = [];

// 1. Defer log ------------------------------------------------------------------------------------
function deferLog(level: LogLevel, message: string): void {
  dfrrMsgs.push({level, message});
}

// 2. Has request metadata -------------------------------------------------------------------------
function hasRequestMetadata(value: unknown): value is RequestMetadata {
  return typeof value === "object" && value !== null;
}

// 3. Create tool catalog ----------------------------------------------------------------------------
// FS_MCP_TOOL_PROFILE=fast-coding narrows tools/list to fs-inspect while dispatch compatibility stays full.
function createToolCatalog(): TlCtlgEntr[] {
  const fullCatalog = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...GT_TL_CTLG, ...WEB_TL_CTLG];
  const profile = process.env.FS_MCP_TOOL_PROFILE ?? "full";

  if (profile === "fast-coding") {
    return fullCatalog.filter((tool) => tool.name === "fs-inspect");
  }
  return fullCatalog;
}

const TOOL_CATALOG = createToolCatalog();

// Function to flush deferred messages after initialization

// 4. Flush deferred messages ----------------------------------------------------------------------
export function flushDeferredMessages(): void {
  while (dfrrMsgs.length > 0) {
    const msg = dfrrMsgs.shift();
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
    version: PCKG_VRSN,
  },
  {
    capabilities: {
      logging: {}, // Add logging capability for console redirection
      resources: {},
      tools: {},
    },
    instructions: SRVR_INST,
  },
);

// 5. Update current client ------------------------------------------------------------------------
function applyCurrentClientUpdate(clientInfo: ClntInfUpdt): void {
  const clientUpdate = updtCurClnt(clientInfo);

  if (clientUpdate.nameChanged) {
    const transport = globalThis.mcpTransport;
    if (transport && typeof transport.configureForClient === "function") {
      transport.configureForClient(curClnt.name);
    }
  }
}

// Add handler for initialization method - capture client info
server.setRequestHandler(IntlReqSch, async (request: IntlReq) => {
  try {
    // Extract and store current client information
    const clientInfo = request.params?.clientInfo;
    if (clientInfo) {
      applyCurrentClientUpdate(clientInfo);
    }
    // Negotiate protocol version with client
    const rqstVrsn = request.params?.protocolVersion;
    const prtcVrsn = rqstVrsn && SUP_PRT_VRS.includes(rqstVrsn) ? rqstVrsn : LTS_PRT_VRS;

    // Return standard initialization response
    return {
      capabilities: {
        logging: {},
        resources: {},
        tools: {},
      },
      instructions: SRVR_INST,
      protocolVersion: prtcVrsn,
      serverInfo: {
        name: "fs-mcp",
        version: PCKG_VRSN,
      },
    };
  }
  catch (error) {
    logToStderr("error", `Error in initialization handler: ${error}`);
    throw error;
  }
});

deferLog("info", "Setting up request ..");

server.setRequestHandler(LstTlsReqSch, async () => {
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

server.setRequestHandler(CllTlReqSch, async (request: CllTlReq): Promise<ServerResult> => {
  const {name, arguments: args} = request.params;
  const startTime = Date.now();

  try {
    const metadata = request.params._meta;
    if (hasRequestMetadata(metadata) && metadata.clientInfo) {
      applyCurrentClientUpdate(metadata.clientInfo);
    }
    const result = await rnWtGtSeSc(bldCuClSeKy(), async () => await dsptTlCll(name, args));
    return result;
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    const errorResult = crtErrRes(errorMessage);

    return nrmlTlRes(name, errorResult, duration);
  }
});

// Add no-op handlers so Visual Studio initialization succeeds
server.setRequestHandler(LstReReSc, async () => ({resources: []}));
server.setRequestHandler(LstReTmReSc, async () => ({resourceTemplates: []}));
