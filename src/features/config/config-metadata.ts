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
  defaultShell: {
    description: "This is the shell used for new command sessions (for example /bin/bash or /bin/zsh). Only change this if you know your environment requires a specific shell.",
    label: "Default Shell",
    valueType: "string",
  },
  fileReadLineLimit: {
    description: "Maximum number of lines returned from a file in one read action. Lower numbers keep responses short and safer; higher numbers return more text at once.",
    label: "File Read Limit",
    valueType: "number",
  },
  fileWriteLineLimit: {
    description: "Maximum number of lines that can be written in one edit operation. This helps prevent accidental oversized writes and keeps file changes predictable.",
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

// 1. Is config field key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isConfigFieldKey(value: string): value is ConfigFieldKey {
  return Object.hasOwn(CONFIG_FIELD_DEFINITIONS, value);
}

// 2. Is config query key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isConfigQueryKey(value: string): value is ConfigQueryKey {
  return Object.hasOwn(CONFIG_QUERY_DEFINITIONS, value);
}
