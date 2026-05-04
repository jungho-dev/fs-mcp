/**
 * @file src/features/config/config-store.ts
 * @description Runtime configuration state store.
 * @author JUNGHO
 * @since 2026-05-02
 */

import os from "node:os";
import path from "node:path";
import {VERSION} from "@cores/runtime/runtime-version";

export interface ServerConfig {
  allowedDirectories?: string[];
  blockedCommands?: string[];
  currentClient?: ClientInfo; // Current connected client information
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

// 1. Get configured allowed directories ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getConfiguredAllowedDirectories(): string[] | undefined {
  const rawAllowedDirectories = process.env.FS_MCP_ALLOWED_DIRECTORIES;

  if (rawAllowedDirectories === undefined) {
    return ;
  }
  return rawAllowedDirectories
    .split(os.platform() === "win32" ? WINDOWS_ALLOWED_DIRECTORIES_SEPARATOR : path.delimiter)
    .map((directory) => directory.trim())
    .filter((directory) => directory.length > 0);
}

// 2. Get default allowed directories ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultAllowedDirectories(): string[] {
  const configuredDirectories = getConfiguredAllowedDirectories();

  if (configuredDirectories !== undefined) {
    return configuredDirectories;
  }
  return [];
}

// 3. Get default shell ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getDefaultShell(): string {
  if (os.platform() === "win32") {
    return "pwsh.exe";
  }
  const configuredShell = process.env.SHELL?.trim();

  if (configuredShell && configuredShell.length > 0) {
    return configuredShell;
  }
  return os.platform() === "darwin" ? "/bin/zsh" : "/bin/sh";
}

// 4. Get default blocked commands ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 5. Config manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class ConfigManager {
  private config: ServerConfig = {};
  private initialized = false;

  // 5-1. Initialize runtime configuration ―――――――――――――――――――――――――――――――――――――――――――
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.config = this.getDefaultConfig();
    this.config["version"] = VERSION;
    this.initialized = true;
  }

  // 5-2. Alias for init() to maintain backward compatibility ―――――――――――――――――――――――――――
  async loadConfig(): Promise<void> {
    return this.init();
  }

  // 5-3. Create default runtime configuration ――――――――――――――――――――――――――――――――――――――――――
  // 6. Get default config ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private getDefaultConfig(): ServerConfig {
    return {
      allowedDirectories: getDefaultAllowedDirectories(),
      blockedCommands: getDefaultBlockedCommands(),
      defaultShell: getDefaultShell(),
      fileReadLineLimit: 50_000,
      fileWriteLineLimit: 50_000,
    };
  }

  // 5-4. Get the entire config ――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async getConfig(): Promise<ServerConfig> {
    await this.init();
    return {...this.config};
  }

  // 5-5. Get a specific configuration value ―――――――――――――――――――――――――――――――――――――――――――
  async getValue(key: string): Promise<unknown> {
    await this.init();
    return this.config[key];
  }

  // 5-6. Set a specific configuration value ―――――――――――――――――――――――――――――――――――――――――――
  async setValue(key: string, value: unknown): Promise<void> {
    await this.init();
    this.config[key] = value;
  }

  // 5-7. Update multiple configuration values at once ――――――――――――――――――――――――――――――――――
  async updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.init();
    this.config = {...this.config, ...updates};
    return {...this.config};
  }

  // 5-8. Reset runtime configuration to defaults ――――――――――――――――――――――――――――――――――――――
  async resetConfig(): Promise<ServerConfig> {
    this.config = this.getDefaultConfig();
    this.config["version"] = VERSION;
    this.initialized = true;
    return {...this.config};
  }

  // 5-9. Runtime config does not create first-run files ―――――――――――――――――――――――――――――――
  isFirstRun(): boolean {
    return false;
  }
}

// Export singleton instance
export const configManager = new ConfigManager();
