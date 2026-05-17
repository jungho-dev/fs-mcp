/**
 * @file src/features/config/config-metadata.ts
 * @description Configuration metadata definitions.
 * @author JUNGHO
 * @since 2026-05-02
 */

export declare type ConfigFieldValueType = "string" | "number" | "boolean" | "array" | "null";

export declare type ConfigFieldDefinition = {
  label: string;
  description: string;
  valueType: ConfigFieldValueType;
};

export declare type ConfigQueryValueType = ConfigFieldValueType | "object";

export declare type ConfigQueryDefinition = {
  label: string;
  description: string;
  valueType: ConfigQueryValueType;
  editable: boolean;
};

// Single source of truth for user-editable configuration fields.
export const CFG_FLD_DFNT = {
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
    description: "Controls whether large tool output is automatically indexed into SQLite. Enabled by default.",
    label: "Context Index Enabled",
    valueType: "boolean",
  },
  contextIndexMaxBytes: {
    description: "Maximum original UTF-8 bytes retained in the SQLite context index before older entries are pruned.",
    label: "Context Index Max Bytes",
    valueType: "number",
  },
  contextIndexMaxDocuments: {
    description: "Maximum context index documents retained before older entries are pruned.",
    label: "Context Index Max Documents",
    valueType: "number",
  },
  contextIndexMaxEntryChars: {
    description: "Maximum characters indexed per context entry. The response metadata still records the original size.",
    label: "Context Index Max Entry Chars",
    valueType: "number",
  },
  contextIndexReplaceLargeOutputs: {
    description: "When explicitly enabled, large auto-indexed tool output is replaced in responses with context index references. Disabled by default so responses keep original data.",
    label: "Context Index Replace Large Outputs",
    valueType: "boolean",
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

export declare type ConfigFieldKey = keyof typeof CFG_FLD_DFNT;

export const CFG_FLD_KYS = Object.keys(CFG_FLD_DFNT) as ConfigFieldKey[];

export const CFG_QRY_DFNT = {
  allowedDirectories: {
    ...CFG_FLD_DFNT.allowedDirectories,
    editable: true,
  },
  availableShells: {
    description: "Detected shell executables that can be used for new process sessions.",
    editable: false,
    label: "Available Shells",
    valueType: "array",
  },
  blockedCommands: {
    ...CFG_FLD_DFNT.blockedCommands,
    editable: true,
  },
  currentClient: {
    description: "Information about the MCP client currently connected to this server instance.",
    editable: false,
    label: "Current Client",
    valueType: "object",
  },
  contextIndexAutoMinChars: {
    ...CFG_FLD_DFNT.contextIndexAutoMinChars,
    editable: true,
  },
  contextIndexAutoMinLines: {
    ...CFG_FLD_DFNT.contextIndexAutoMinLines,
    editable: true,
  },
  contextIndexDbPath: {
    ...CFG_FLD_DFNT.contextIndexDbPath,
    editable: true,
  },
  contextIndexEnabled: {
    ...CFG_FLD_DFNT.contextIndexEnabled,
    editable: true,
  },
  contextIndexMaxBytes: {
    ...CFG_FLD_DFNT.contextIndexMaxBytes,
    editable: true,
  },
  contextIndexMaxDocuments: {
    ...CFG_FLD_DFNT.contextIndexMaxDocuments,
    editable: true,
  },
  contextIndexMaxEntryChars: {
    ...CFG_FLD_DFNT.contextIndexMaxEntryChars,
    editable: true,
  },
  contextIndexReplaceLargeOutputs: {
    ...CFG_FLD_DFNT.contextIndexReplaceLargeOutputs,
    editable: true,
  },
  defaultShell: {
    ...CFG_FLD_DFNT.defaultShell,
    editable: true,
  },
  fileReadLineLimit: {
    ...CFG_FLD_DFNT.fileReadLineLimit,
    editable: true,
  },
  fileWriteLineLimit: {
    ...CFG_FLD_DFNT.fileWriteLineLimit,
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

export declare type ConfigQueryKey = keyof typeof CFG_QRY_DFNT;

export const CFG_QRY_KYS = Object.keys(CFG_QRY_DFNT) as ConfigQueryKey[];

// 1. Is config field key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isConfigFieldKey(value: string): value is ConfigFieldKey {
  return Object.hasOwn(CFG_FLD_DFNT, value);
}

// 2. Is config query key ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isConfigQueryKey(value: string): value is ConfigQueryKey {
  return Object.hasOwn(CFG_QRY_DFNT, value);
}
