/**
 * @file src/features/config/config-client.ts
 * @description Current MCP client state and context index path helpers.
 * @author JUNGHO
 * @since 2026-05-08
 */

export type CurrentClient = {
  name: string;
  version: string;
};

export type ClientInfoUpdate = {
  name?: string;
  version?: string;
};

const DEFAULT_CLIENT: CurrentClient = {name: "uninitialized", version: "uninitialized"};

export let currentClient: CurrentClient = {...DEFAULT_CLIENT};

// 1. Get current client snapshot ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getCurrentClient(): CurrentClient {
  return {...currentClient};
}

// 2. Build current client session key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function buildCurrentClientSessionKey(): string {
  return `${currentClient.name}@${currentClient.version}`;
}

// 3. Get default context index DB path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getDefaultContextIndexDbPath(): string {
  return "~/.mcp/fs-mcp.sqlite";
}

// 4. Update current client ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function updateCurrentClient(clientInfo: ClientInfoUpdate): {changed: boolean; nameChanged: boolean} {
  const nextClient: CurrentClient = {
    name: clientInfo.name ?? currentClient.name,
    version: clientInfo.version ?? currentClient.version,
  };
  const changed = nextClient.name !== currentClient.name || nextClient.version !== currentClient.version;
  const nameChanged = nextClient.name !== currentClient.name;

  if (changed) {
    currentClient = nextClient;
  }
  return {changed, nameChanged};
}
