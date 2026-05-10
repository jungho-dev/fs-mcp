/**
 * @file src/features/config/config-client.ts
 * @description Current MCP client state and client path helpers.
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

type ClientHomeDirectoryRule = {
  directoryName: string;
  matchTokens: string[];
};

const DEFAULT_CLIENT: CurrentClient = {name: "uninitialized", version: "uninitialized"};
const DEFAULT_CLIENT_HOME_DIRECTORY = ".codex";
const CLIENT_HOME_DIRECTORY_RULES: ClientHomeDirectoryRule[] = [
  {directoryName: ".codex", matchTokens: ["codex"]},
  {directoryName: ".claude", matchTokens: ["claude"]},
  {directoryName: ".cline", matchTokens: ["cline"]},
  {directoryName: ".cursor", matchTokens: ["cursor"]},
  {directoryName: ".windsurf", matchTokens: ["windsurf"]},
  {directoryName: ".roo", matchTokens: ["roo"]},
  {directoryName: ".vscode", matchTokens: ["visual studio", "visualstudio", "vscode"]},
];

export let currentClient: CurrentClient = {...DEFAULT_CLIENT};

// 1. Normalize client name ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeClientName(value: string): string {
  return value.trim().toLowerCase();
}

// 2. Create fallback client home directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createFallbackClientHomeDirectory(clientName: string): string {
  const normalizedClientName = normalizeClientName(clientName);
  const slug = normalizedClientName
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0 || slug === "uninitialized" || slug === "unknown") {
    return DEFAULT_CLIENT_HOME_DIRECTORY;
  }
  return `.${slug}`;
}

// 3. Get current client snapshot ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getCurrentClient(): CurrentClient {
  return {...currentClient};
}

// 4. Build current client session key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function buildCurrentClientSessionKey(): string {
  return `${currentClient.name}@${currentClient.version}`;
}

// 5. Resolve client home directory ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getClientHomeDirectory(clientName: string = currentClient.name): string {
  const normalizedClientName = normalizeClientName(clientName);

  for (const rule of CLIENT_HOME_DIRECTORY_RULES) {
    if (rule.matchTokens.some((token) => normalizedClientName.includes(token))) {
      return rule.directoryName;
    }
  }
  return createFallbackClientHomeDirectory(normalizedClientName);
}

// 6. Get default context index DB path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getDefaultContextIndexDbPath(_clientName: string = currentClient.name): string {
  return "~/.mcp/fs-mcp.sqlite";
}

// 7. Update current client ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
