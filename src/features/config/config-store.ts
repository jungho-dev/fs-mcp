/**
 * @file src/features/config/config-store.ts
 * @description Runtime configuration state store.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {existsSync, readFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath as flUrlTPth2} from "node:url";
import {getDefaultContextIndexDbPath as gtDeCtIdDbPt} from "@features/config/config-client";

export declare interface ServerConfig {
  allowedDirectories?: string[];
  blockedCommands?: string[];
  contextIndexAutoMinChars?: number;
  contextIndexAutoMinLines?: number;
  contextIndexDbPath?: string;
  contextIndexEnabled?: boolean;
  contextIndexMaxBytes?: number;
  contextIndexMaxDocuments?: number;
  contextIndexMaxEntryChars?: number;
  contextIndexReplaceLargeOutputs?: boolean;
  currentClient?: ClientInfo; // Current connected client information
  defaultShell?: string;
  fileReadLineLimit?: number; // Legacy read hint; read operations are uncapped unless length is provided
  fileWriteLineLimit?: number; // Large write/edit warning threshold
  [key: string]: unknown; // Allow for arbitrary configuration keys
}
export declare interface ClientInfo {
  name: string;
  version: string;
}

const WADS = ";";
const WPCS = "-NoLogo -NoProfile -ExecutionPolicy Bypass -Command";
const PCKG_JSN_PT2 = path.resolve(path.dirname(flUrlTPth2(import.meta.url)), "..", "..", "..", "package.json");

function readPackageVersion(): string {
  const packageData = JSON.parse(readFileSync(PCKG_JSN_PT2, "utf8")) as unknown;

  if (typeof packageData !== "object" || packageData === null || !("version" in packageData) || typeof packageData.version !== "string") {
    throw new Error("package.json version must be a string");
  }
  return packageData.version;
}

export const PCKG_VRSN = readPackageVersion();
export {PCKG_VRSN as PACKAGE_VERSION};

// 1. Get configured allowed directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getConfiguredAllowedDirectories(): string[] | undefined {
  const rwAllwDrct = process.env.FS_MCP_ALLOWED_DIRECTORIES;

  if (rwAllwDrct === undefined) {
    return undefined;
  }
  return rwAllwDrct
    .split(os.platform() === "win32" ? WADS : path.delimiter)
    .map((directory) => directory.trim())
    .filter((directory) => directory.length > 0);
}

// 2. Get default allowed directories ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultAllowedDirectories(): string[] {
  const cnfgDrct = getConfiguredAllowedDirectories();

  if (cnfgDrct !== undefined) {
    return cnfgDrct;
  }
  return [];
}

// 3. Get Windows default shell ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getWindowsDefaultShell(): string {
  const userProfile = process.env.USERPROFILE?.trim();
  const programFiles = process.env.ProgramFiles?.trim();
  const knwnPwshPths = [
    programFiles ? path.join(programFiles, "PowerShell", "7", "pwsh.exe") : "",
    userProfile ? path.join(userProfile, "AppData", "Local", "Programs", "PowerShell", "7", "pwsh.exe") : "",
  ].filter((shellPath) => shellPath.length > 0);

  const rslvPwshPth = knwnPwshPths.find((shellPath) => existsSync(shellPath));
  if (rslvPwshPth) {
    return `${rslvPwshPth} ${WPCS}`;
  }
  const comSpec = process.env.ComSpec?.trim();
  if (comSpec && comSpec.length > 0) {
    return comSpec;
  }
  const systemRoot = process.env.SystemRoot?.trim();
  if (systemRoot && systemRoot.length > 0) {
    const systCmdPth = path.join(systemRoot, "System32", "cmd.exe");
    if (existsSync(systCmdPth)) {
      return systCmdPth;
    }
  }
  return "cmd.exe";
}

// 4. Get default shell ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultShell(): string {
  if (os.platform() === "win32") {
    return getWindowsDefaultShell();
  }
  const cnfgShll = process.env.SHELL?.trim();

  if (cnfgShll && cnfgShll.length > 0) {
    return cnfgShll;
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

// 5. Get stored context index DB path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getStoredContextIndexDbPath(config: ServerConfig): string | undefined {
  return typeof config.contextIndexDbPath === "string" && config.contextIndexDbPath.trim().length > 0 ? config.contextIndexDbPath : undefined;
}

// 6. Normalize context index DB path override ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeContextIndexDbPathOverride(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === gtDeCtIdDbPt() ? undefined : value;
}

// 7. Materialize runtime config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function materializeRuntimeConfig(config: ServerConfig): ServerConfig {
  return {
    ...config,
    contextIndexDbPath: getStoredContextIndexDbPath(config) ?? gtDeCtIdDbPt(),
  };
}

// 8. Config manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class ConfigManager {
  private config: ServerConfig = {};
  private initialized = false;

  // 8-1. Initialize runtime configuration ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.config = this.getDefaultConfig();
    this.config["version"] = PCKG_VRSN;
    this.initialized = true;
  }

  // 8-2. Alias for init() to maintain backward compatibility ――――――――――――――――――――――――――――――――――――――
  async loadConfig(): Promise<void> {
    return this.init();
  }

  // 9. Get default config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getDefaultConfig(): ServerConfig {
    return {
      allowedDirectories: getDefaultAllowedDirectories(),
      blockedCommands: getDefaultBlockedCommands(),
      contextIndexAutoMinChars: 5000,
      contextIndexAutoMinLines: 120,
      contextIndexEnabled: true,
      contextIndexMaxEntryChars: 1_000_000,
      contextIndexReplaceLargeOutputs: false,
      defaultShell: getDefaultShell(),
      fileReadLineLimit: 50_000,
      fileWriteLineLimit: 50_000,
    };
  }

  // 8-4. Get the entire config ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getConfig(): Promise<ServerConfig> {
    await this.init();
    return materializeRuntimeConfig(this.config);
  }

  // 8-4-1. Get the entire config synchronously ――――――――――――――――――――――――――――――――――――――――――――――――――
  getConfigSync(): ServerConfig {
    if (!this.initialized) {
      this.config = this.getDefaultConfig();
      this.config["version"] = PCKG_VRSN;
      this.initialized = true;
    }
    return materializeRuntimeConfig(this.config);
  }

  // 8-5. Get a specific configuration value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getValue(key: string): Promise<unknown> {
    await this.init();
    return materializeRuntimeConfig(this.config)[key];
  }

  // 8-6. Set a specific configuration value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async setValue(key: string, value: unknown): Promise<void> {
    await this.init();
    if (key === "contextIndexDbPath") {
      this.config.contextIndexDbPath = normalizeContextIndexDbPathOverride(typeof value === "string" ? value : undefined);
      return;
    }
    this.config[key] = value;
  }

  // 8-7. Update multiple configuration values at once ―――――――――――――――――――――――――――――――――――――――――――――
  async updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.init();
    const nextConfig = {...this.config, ...updates};
    nextConfig.contextIndexDbPath = normalizeContextIndexDbPathOverride(getStoredContextIndexDbPath(nextConfig));
    this.config = nextConfig;
    return materializeRuntimeConfig(this.config);
  }

  // 8-8. Reset runtime configuration to defaults ――――――――――――――――――――――――――――――――――――――――――――――――――
  async resetConfig(): Promise<ServerConfig> {
    this.config = this.getDefaultConfig();
    this.config["version"] = PCKG_VRSN;
    this.initialized = true;
    return materializeRuntimeConfig(this.config);
  }

  // 8-9. Runtime config does not create first-run files ―――――――――――――――――――――――――――――――――――――――――――
  isFirstRun(): boolean {
    return false;
  }
}

// Export singleton instance
export const cfgMgr = new ConfigManager();
export const configManager = cfgMgr;
export const cfgMgr2 = cfgMgr;
export const PCKG_VRSN2 = PCKG_VRSN;
export const cfgMgr3 = cfgMgr;
