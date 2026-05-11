/**
 * @file src/features/config/config-metadata.ts
 * @description Configuration metadata definitions.
 * @author JUNGHO
 * @since 2026-05-02
 */

export type ConfigFieldValueType = "string" | "number" | "boolean" | "array" | "null";

export type ConfigFieldDefinition = {
  label: string;
  description: string;
  valueType: ConfigFieldValueType;
};

export type ConfigQueryValueType = ConfigFieldValueType | "object";

export type ConfigQueryDefinition = {
  label: string;
  description: string;
  valueType: ConfigQueryValueType;
  editable: boolean;
};

// Single source of truth for user-editable configuration fields.
export const CONFIG_FIELD_DEFINITIONS = {
  allowedDirectories: {
    description: "These are the folders fs-mcp is allowed to read and edit. Think of this as a permission list. Keeping it small is safer. If this list is empty, fs-mcp can access your entire filesystem.",
    label: "Allowed Folders",
    valueType: "array",
  },
  blockedCommands: {
    description: "This is your personal safety blocklist. If a command appears here, fs-mcp will refuse to run it even if a prompt asks for it. Add risky commands you never want executed by mistake.",
    label: "Blocked Commands",
    valueType: "array",
  },
  contextIndexAutoMinChars: {
    description: "Minimum character count that triggers automatic SQLite context indexing for large tool output.",
    label: "Context Index Auto Min Chars",
    valueType: "number",
  },
  contextIndexAutoMinLines: {
    description: "Minimum line count that triggers automatic SQLite context indexing for large tool output.",
    label: "Context Index Auto Min Lines",
    valueType: "number",
  },
  contextIndexDbPath: {
    description: "SQLite database path used by the fs-mcp context index. When not overridden, the default follows the active MCP client home (for example ~/.codex or ~/.claude).",
    label: "Context Index DB Path",
    valueType: "string",
  },
  contextIndexEnabled: {
    description: "Controls whether large tool output is automatically indexed into SQLite. Enabled by default while visible tool output remains full length.",
    label: "Context Index Enabled",
    valueType: "boolean",
  },
  contextIndexMaxEntryChars: {
    description: "Maximum characters indexed per context entry. The response metadata still records the original size.",
    label: "Context Index Max Entry Chars",
    valueType: "number",
  },
  defaultShell: {
    description: "This is the shell used for new command sessions (for example /bin/bash or /bin/zsh). Only change this if you know your environment requires a specific shell.",
    label: "Default Shell",
    valueType: "string",
  },
  fileReadLineLimit: {
    description: "Legacy read hint. File reads are not capped unless a tool call provides length; visible output previews are capped separately.",
    label: "File Read Limit",
    valueType: "number",
  },
  fileWriteLineLimit: {
    description: "Large write/edit warning threshold. Write and edit operations are not blocked by this value.",
    label: "File Write Limit",
    valueType: "number",
  },
} as const satisfies Record<string, ConfigFieldDefinition>;

export type ConfigFieldKey = keyof typeof CONFIG_FIELD_DEFINITIONS;

export const CONFIG_FIELD_KEYS = Object.keys(CONFIG_FIELD_DEFINITIONS) as ConfigFieldKey[];

export const CONFIG_QUERY_DEFINITIONS = {
  allowedDirectories: {
    ...CONFIG_FIELD_DEFINITIONS.allowedDirectories,
    editable: true,
  },
  availableShells: {
    description: "Detected shell executables that can be used for new process sessions.",
    editable: false,
    label: "Available Shells",
    valueType: "array",
  },
  blockedCommands: {
    ...CONFIG_FIELD_DEFINITIONS.blockedCommands,
    editable: true,
  },
  currentClient: {
    description: "Information about the MCP client currently connected to this server instance.",
    editable: false,
    label: "Current Client",
    valueType: "object",
  },
  contextIndexAutoMinChars: {
    ...CONFIG_FIELD_DEFINITIONS.contextIndexAutoMinChars,
    editable: true,
  },
  contextIndexAutoMinLines: {
    ...CONFIG_FIELD_DEFINITIONS.contextIndexAutoMinLines,
    editable: true,
  },
  contextIndexDbPath: {
    ...CONFIG_FIELD_DEFINITIONS.contextIndexDbPath,
    editable: true,
  },
  contextIndexEnabled: {
    ...CONFIG_FIELD_DEFINITIONS.contextIndexEnabled,
    editable: true,
  },
  contextIndexMaxEntryChars: {
    ...CONFIG_FIELD_DEFINITIONS.contextIndexMaxEntryChars,
    editable: true,
  },
  defaultShell: {
    ...CONFIG_FIELD_DEFINITIONS.defaultShell,
    editable: true,
  },
  fileReadLineLimit: {
    ...CONFIG_FIELD_DEFINITIONS.fileReadLineLimit,
    editable: true,
  },
  fileWriteLineLimit: {
    ...CONFIG_FIELD_DEFINITIONS.fileWriteLineLimit,
    editable: true,
  },
  systemInfo: {
    description: "Operating system, runtime, and memory details for the current server process.",
    editable: false,
    label: "System Info",
    valueType: "object",
  },
  version: {
    description: "Current fs-mcp version loaded by this server instance.",
    editable: false,
    label: "Version",
    valueType: "string",
  },
} as const satisfies Record<string, ConfigQueryDefinition>;

export type ConfigQueryKey = keyof typeof CONFIG_QUERY_DEFINITIONS;

export const CONFIG_QUERY_KEYS = Object.keys(CONFIG_QUERY_DEFINITIONS) as ConfigQueryKey[];

// 1. Is config field key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isConfigFieldKey(value: string): value is ConfigFieldKey {
  return Object.hasOwn(CONFIG_FIELD_DEFINITIONS, value);
}

// 2. Is config query key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isConfigQueryKey(value: string): value is ConfigQueryKey {
  return Object.hasOwn(CONFIG_QUERY_DEFINITIONS, value);
}
