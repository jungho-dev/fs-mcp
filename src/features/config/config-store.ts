/**
 * @file src/features/config/config-store.ts
 * @description Runtime configuration state store.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {existsSync, readFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

export interface ServerConfig {
  allowedDirectories?: string[];
  blockedCommands?: string[];
  currentClient?: ClientInfo; // Current connected client information
  contextIndexAutoMinChars?: number;
  contextIndexAutoMinLines?: number;
  contextIndexDbPath?: string;
  contextIndexEnabled?: boolean;
  contextIndexMaxEntryChars?: number;
  defaultShell?: string;
  fileReadLineLimit?: number; // Legacy read hint; read operations are uncapped unless length is provided
  fileWriteLineLimit?: number; // Large write/edit warning threshold
  [key: string]: unknown; // Allow for arbitrary configuration keys
}
export interface ClientInfo {
  name: string;
  version: string;
}

const WINDOWS_ALLOWED_DIRECTORIES_SEPARATOR = ";";
const WINDOWS_POWERSHELL_COMMAND_SUFFIX = "-NoLogo -NoProfile -ExecutionPolicy Bypass -Command";
const PACKAGE_JSON_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json");

function readPackageVersion(): string {
  const packageData = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as unknown;

  if (typeof packageData !== "object" || packageData === null || !("version" in packageData) || typeof packageData.version !== "string") {
    throw new Error("package.json version must be a string");
  }
  return packageData.version;
}

export const PACKAGE_VERSION = readPackageVersion();

// 1. Get configured allowed directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getConfiguredAllowedDirectories(): string[] | undefined {
  const rawAllowedDirectories = process.env.FS_MCP_ALLOWED_DIRECTORIES;

  if (rawAllowedDirectories === undefined) {
    return undefined;
  }
  return rawAllowedDirectories
    .split(os.platform() === "win32" ? WINDOWS_ALLOWED_DIRECTORIES_SEPARATOR : path.delimiter)
    .map((directory) => directory.trim())
    .filter((directory) => directory.length > 0);
}

// 2. Get default allowed directories ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultAllowedDirectories(): string[] {
  const configuredDirectories = getConfiguredAllowedDirectories();

  if (configuredDirectories !== undefined) {
    return configuredDirectories;
  }
  return [];
}

// 3. Get Windows default shell ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getWindowsDefaultShell(): string {
  const userProfile = process.env.USERPROFILE?.trim();
  const programFiles = process.env.ProgramFiles?.trim();
  const knownPwshPaths = [
    programFiles ? path.join(programFiles, "PowerShell", "7", "pwsh.exe") : "",
    userProfile ? path.join(userProfile, "AppData", "Local", "Programs", "PowerShell", "7", "pwsh.exe") : "",
  ].filter((shellPath) => shellPath.length > 0);

  const resolvedPwshPath = knownPwshPaths.find((shellPath) => existsSync(shellPath));
  if (resolvedPwshPath) {
    return `${resolvedPwshPath} ${WINDOWS_POWERSHELL_COMMAND_SUFFIX}`;
  }
  const comSpec = process.env.ComSpec?.trim();
  if (comSpec && comSpec.length > 0) {
    return comSpec;
  }
  const systemRoot = process.env.SystemRoot?.trim();
  if (systemRoot && systemRoot.length > 0) {
    const systemCmdPath = path.join(systemRoot, "System32", "cmd.exe");
    if (existsSync(systemCmdPath)) {
      return systemCmdPath;
    }
  }
  return "cmd.exe";
}

// 4. Get default shell ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultShell(): string {
  if (os.platform() === "win32") {
    return getWindowsDefaultShell();
  }
  const configuredShell = process.env.SHELL?.trim();

  if (configuredShell && configuredShell.length > 0) {
    return configuredShell;
  }
  return os.platform() === "darwin" ? "/bin/zsh" : "/bin/sh";
}

// 4. Get default blocked commands ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultBlockedCommands(): string[] {
  return [
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
  ];
}

// 5. Config manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class ConfigManager {
  private config: ServerConfig = {};
  private initialized = false;

  // 5-1. Initialize runtime configuration ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.config = this.getDefaultConfig();
    this.config["version"] = PACKAGE_VERSION;
    this.initialized = true;
  }

  // 5-2. Alias for init() to maintain backward compatibility ――――――――――――――――――――――――――――――――――――――
  async loadConfig(): Promise<void> {
    return this.init();
  }

  // 6. Get default config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getDefaultConfig(): ServerConfig {
    return {
      allowedDirectories: getDefaultAllowedDirectories(),
      blockedCommands: getDefaultBlockedCommands(),
      contextIndexAutoMinChars: 5000,
      contextIndexAutoMinLines: 120,
      contextIndexDbPath: "~/.codex/sqlite/fs-mcp.sqlite",
      contextIndexEnabled: true,
      contextIndexMaxEntryChars: 1_000_000,
      defaultShell: getDefaultShell(),
      fileReadLineLimit: 50_000,
      fileWriteLineLimit: 50_000,
    };
  }

  // 5-4. Get the entire config ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getConfig(): Promise<ServerConfig> {
    await this.init();
    return {...this.config};
  }

  // 5-4-1. Get the entire config synchronously ――――――――――――――――――――――――――――――――――――――――――――――――――
  getConfigSync(): ServerConfig {
    if (!this.initialized) {
      this.config = this.getDefaultConfig();
      this.config["version"] = PACKAGE_VERSION;
      this.initialized = true;
    }
    return {...this.config};
  }

  // 5-5. Get a specific configuration value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getValue(key: string): Promise<unknown> {
    await this.init();
    return this.config[key];
  }

  // 5-6. Set a specific configuration value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async setValue(key: string, value: unknown): Promise<void> {
    await this.init();
    this.config[key] = value;
  }

  // 5-7. Update multiple configuration values at once ―――――――――――――――――――――――――――――――――――――――――――――
  async updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.init();
    this.config = {...this.config, ...updates};
    return {...this.config};
  }

  // 5-8. Reset runtime configuration to defaults ――――――――――――――――――――――――――――――――――――――――――――――――――
  async resetConfig(): Promise<ServerConfig> {
    this.config = this.getDefaultConfig();
    this.config["version"] = PACKAGE_VERSION;
    this.initialized = true;
    return {...this.config};
  }

  // 5-9. Runtime config does not create first-run files ―――――――――――――――――――――――――――――――――――――――――――
  isFirstRun(): boolean {
    return false;
  }
}

// Export singleton instance
export const configManager = new ConfigManager();
