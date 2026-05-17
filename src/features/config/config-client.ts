/**
 * @file src/features/config/config-client.ts
 * @description Current MCP client state and context index path helpers.
 * @author JUNGHO
 * @since 2026-05-08
 */

export declare type CurrentClient = {
  name: string;
  version: string;
};

export declare type ClientInfoUpdate = {
  name?: string;
  version?: string;
};

const DEF_CLNT: CurrentClient = {name: "uninitialized", version: "uninitialized"};
export let curClnt: CurrentClient = {...DEF_CLNT};

// 1. Get current client snapshot ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getCurrentClient(): CurrentClient {
  return {...curClnt};
}

// 2. Build current client session key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function buildCurrentClientSessionKey(): string {
  return `${curClnt.name}@${curClnt.version}`;
}

// 3. Get default context index DB path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getDefaultContextIndexDbPath(): string {
  return "~/.mcp/fs-mcp.sqlite";
}

// 4. Update current client ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function updateCurrentClient(clientInfo: ClientInfoUpdate): {changed: boolean; nameChanged: boolean} {
  const nextClient: CurrentClient = {
    name: clientInfo.name ?? curClnt.name,
    version: clientInfo.version ?? curClnt.version,
  };
  const changed = nextClient.name !== curClnt.name || nextClient.version !== curClnt.version;
  const nameChanged = nextClient.name !== curClnt.name;

  if (changed) {
    curClnt = nextClient;
  }
  return {changed, nameChanged};
}
