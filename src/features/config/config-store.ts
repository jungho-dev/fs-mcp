/**
 * @file src/features/config/config-store.ts
 * @description Configuration state store.
 * @author JUNGHO
 * @since 2026-05-02
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {VERSION} from "@cores/runtime/runtime-version";
import {CONFIG_FILE, LEGACY_CONFIG_FILE} from "@features/config/config-paths";

export interface ServerConfig {
  allowedDirectories?: string[];
  blockedCommands?: string[];
  currentClient?: ClientInfo; // Current connected client information
  defaultShell?: string;
  fileReadLineLimit?: number; // Default line limit for file read operations (changed from character-based)
  fileWriteLineLimit?: number; // Line limit for file write operations
  [key: string]: unknown; // Allow for arbitrary configuration keys
}
export interface ClientInfo {
  name: string;
  version: string;
}
const CONFIG_LINE_SEPARATOR_REGEX = /\r?\n/;
const WINDOWS_ALLOWED_DIRECTORIES_SEPARATOR = ";";

type ErrnoLike = Error & {
  code?: string;
};

type LoadedConfig = {
  config: ServerConfig;
  migrated: boolean;
};

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && (error as ErrnoLike).code === "ENOENT";
}
function stripTomlComment(line: string): string {
  let result = "";
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let isEscaped = false;

  for (const character of line) {
    if (isEscaped) {
    	result += character;
      isEscaped = false;
      continue;
    }
    if (character === "\\" && inDoubleQuote) {
    	result += character;
      isEscaped = true;
      continue;
    }
    if (character === '"' && !inSingleQuote) {
    	inDoubleQuote = !inDoubleQuote;
      result += character;
      continue;
    }
    if (character === "'" && !inDoubleQuote) {
    	inSingleQuote = !inSingleQuote;
      result += character;
      continue;
    }
    if (character === "#" && !inDoubleQuote && !inSingleQuote) {
    	break;
    }
    result += character;
  }
  return result;
}
function getTomlBracketDepth(value: string): number {
  let depth = 0;
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let isEscaped = false;

  for (const character of value) {
    if (isEscaped) {
    	isEscaped = false;
      continue;
    }
    if (character === "\\" && inDoubleQuote) {
    	isEscaped = true;
      continue;
    }
    if (character === '"' && !inSingleQuote) {
    	inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (character === "'" && !inDoubleQuote) {
    	inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inDoubleQuote && !inSingleQuote) {
      if (character === "[") {
      	depth += 1;
      }
      else if (character === "]") {
      	depth -= 1;
      }
    }
  }
  return depth;
}
function parseTomlScalar(value: string): unknown {
  if (value.startsWith('"')) {
  	return JSON.parse(value);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
  	return value.slice(1, -1);
  }
  if (value === "true" || value === "false") {
  	return value === "true";
  }
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
  	return Number(value);
  }
  throw new Error(`Unsupported TOML value: ${value}`);
}
function parseTomlArray(value: string): unknown[] {
  const normalizedValue = value.replace(/,\s*]/g, "]");
  return JSON.parse(normalizedValue) as unknown[];
}
function parseTomlConfig(configText: string): ServerConfig {
  const config: ServerConfig = {};
  const lines = configText.split(CONFIG_LINE_SEPARATOR_REGEX);

  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index];
    const line = stripTomlComment(originalLine).trim();

    if (line.length === 0) {
    	continue;
    }
    if (line.startsWith("[") && !line.includes("=")) {
      throw new Error(`TOML sections are not supported in ${CONFIG_FILE}: ${originalLine}`);
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Invalid TOML config line: ${originalLine}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    let valueText = line.slice(separatorIndex + 1).trim();

    if (valueText.startsWith("[")) {
      while (getTomlBracketDepth(valueText) > 0) {
        index += 1;
        if (index >= lines.length) {
          throw new Error(`Unterminated TOML array for key ${key}`);
        }
        valueText = `${valueText}\n${stripTomlComment(lines[index]).trim()}`;
      }
      config[key] = parseTomlArray(valueText);
      continue;
    }
    config[key] = parseTomlScalar(valueText);
  }
  return config;
}
function formatTomlString(value: string): string {
  return JSON.stringify(value);
}
function formatTomlValue(value: unknown): string | null {
  if (value === undefined || value === null) {
  	return null;
  }
  if (Array.isArray(value)) {
    const formattedItems = value.map((item) => formatTomlValue(item)).filter((item): item is string => item !== null);
    return `[${formattedItems.join(", ")}]`;
  }
  if (typeof value === "string") {
  	return formatTomlString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
  	return String(value);
  }
  return null;
}
function serializeTomlConfig(config: ServerConfig): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(config)) {
    const formattedValue = formatTomlValue(value);
    if (formattedValue !== null) {
      lines.push(`${key} = ${formattedValue}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
function getDefaultAllowedDirectories(): string[] {
  const configuredDirectories = process.env.FS_MCP_ALLOWED_DIRECTORIES?.split(os.platform() === "win32" ? WINDOWS_ALLOWED_DIRECTORIES_SEPARATOR : path.delimiter)
    .map((directory) => directory.trim())
    .filter((directory) => directory.length > 0);

  if (configuredDirectories !== undefined) {
  	return configuredDirectories;
  }
  return ["C:\\JUNGHO", "C:\\Windows", "C:\\Users\\jungh", "C:\\Users\\jungh\\.codex", "C:\\JUNGHO\\9.Workspace\\2.Project\\2.Node\\fs-mcp"];
}
// 1. Singleton config manager for the server ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class ConfigManager {
  private readonly configPath: string;
  private config: ServerConfig = {};
  private initialized = false;
  private _isFirstRun = false; // Track if this is the first run (config was just created)

  constructor() {
    this.configPath = CONFIG_FILE;
  }
  // 2. Initialize configuration - load from disk or create default ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async init() {
    if (this.initialized) {
    	return;
    }
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, {recursive: true});

      const loadedConfig = await this.loadPersistedConfig();
      if (loadedConfig !== null) {
      	this.config = loadedConfig.config;
        this._isFirstRun = false;
      }
      else {
      	this.config = this.getDefaultConfig();
        this._isFirstRun = true;
      }
      this.config["version"] = VERSION;
      if (loadedConfig === null || loadedConfig.migrated) {
      	await this.saveConfig();
      }
      this.initialized = true;
    }
    catch (error) {
      console.error("Failed to initialize config:", error);
      this.config = this.getDefaultConfig();
      this.config["version"] = VERSION;
      this.initialized = true;
    }
  }
  // 3. Alias for init() to maintain backward compatibility ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async loadConfig() {
    return this.init();
  }
  private async loadPersistedConfig(): Promise<LoadedConfig | null> {
    try {
      const configData = await fs.readFile(this.configPath, "utf8");
      return {config: parseTomlConfig(configData), migrated: false};
    }
    catch (error) {
      if (!isMissingFileError(error)) {
      	throw error;
      }
    }
    try {
      const legacyConfigData = await fs.readFile(LEGACY_CONFIG_FILE, "utf8");
      return {config: JSON.parse(legacyConfigData) as ServerConfig, migrated: true};
    }
    catch (error) {
      if (isMissingFileError(error)) {
      	return null;
      }
      throw error;
    }
  }
  // 4. Create default configuration ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getDefaultConfig(): ServerConfig {
    return {
      allowedDirectories: getDefaultAllowedDirectories(),
      blockedCommands: [
        // Disk and partition management
        "mkfs", // Create a filesystem on a device
        "format", // Format a storage device (cross-platform)
        "mount", // Mount a filesystem
        "umount", // Unmount a filesystem
        "fdisk", // Manipulate disk partition tables
        "dd", // Convert and copy files, can write directly to disks
        "parted", // Disk partition manipulator
        "diskpart", // Windows disk partitioning utility

        // System administration and user management
        "sudo", // Execute command as superuser
        "su", // Substitute user identity
        "passwd", // Change user password
        "adduser", // Add a user to the system
        "useradd", // Create a new user
        "usermod", // Modify user account
        "groupadd", // Create a new group
        "chsh", // Change login shell
        "visudo", // Edit the sudoers file

        // System control
        "shutdown", // Shutdown the system
        "reboot", // Restart the system
        "halt", // Stop the system
        "poweroff", // Power off the system
        "init", // Change system runlevel

        // Network and security
        "iptables", // Linux firewall administration
        "firewall", // Generic firewall command
        "netsh", // Windows network configuration

        // Windows system commands
        "sfc", // System File Checker
        "bcdedit", // Boot Configuration Data editor
        "reg", // Windows registry editor
        "net", // Network/user/service management
        "sc", // Service Control manager
        "runas", // Execute command as another user
        "cipher", // Encrypt/decrypt files or wipe data
        "takeown", // Take ownership of files
      ],
      defaultShell: (() => {
        if (os.platform() === "win32") {
        	return "pwsh.exe";
        }
        const fallbackShell = os.platform() === "darwin" ? "/bin/zsh" : "/bin/sh";
        const userShell = process.env.SHELL || fallbackShell;
        return userShell;
      })(),
      fileReadLineLimit: 50_000,
      fileWriteLineLimit: 50_000,
    };
  }
  // 5. Save config to disk ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private async saveConfig () {
    try {
      const persistableConfig = Object.fromEntries(Object.entries(this.config).filter(([, value]) => formatTomlValue(value) !== null)) as ServerConfig;
      await fs.writeFile(this.configPath, serializeTomlConfig(persistableConfig), "utf8");
    }
    catch (error) {
      console.error("Failed to save config:", error);
      throw error;
    }
  }
  // 6. Get the entire config ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getConfig(): Promise<ServerConfig> {
    await this.init();
    return {...this.config};
  }
  // 7. Get a specific configuration value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getValue(key: string): Promise<unknown> {
    await this.init();
    return this.config[key];
  }
  // 8. Set a specific configuration value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async setValue(key: string, value: unknown): Promise<void> {
    await this.init();
    this.config[key] = value;
    await this.saveConfig();
  }
  // 9. Update multiple configuration values at once ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.init();
    this.config = {...this.config, ...updates};
    await this.saveConfig();
    return {...this.config};
  }
  // 10. Reset configuration to defaults ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async resetConfig(): Promise<ServerConfig> {
    this.config = this.getDefaultConfig();
    this.config["version"] = VERSION;
    await this.saveConfig();
    return {...this.config};
  }
  // 11. Check if this is the first run (config file was just created) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  isFirstRun(): boolean {
    return this._isFirstRun;
  }
}

// Export singleton instance
export const configManager = new ConfigManager();
