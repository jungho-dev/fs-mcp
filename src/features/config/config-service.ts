/**
 * @file src/features/config/config-service.ts
 * @description Configuration service operations.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {constants as fsConstants, existsSync, statSync} from "node:fs";
import {access, readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {ServerResult} from "@assets/type/common";
import {getSystemInfo as gtSystInf} from "@cores/runtime/runtime-info";
import {getCurrentClient as gtCurClnt, getDefaultContextIndexDbPath as gtDfCtIdDbPt} from "@features/config/config-client";
import {CFG_FLD_DFNT, CFG_FLD_KYS, CFG_QRY_DFNT, type ConfigQueryKey as CfgQryKy, isConfigFieldKey as isCfgFldKy} from "@features/config/config-metadata";
import {cfgMgr, type ServerConfig as SrvrCfg} from "@features/config/config-store";
import {readFileInternal as rdFlInt} from "@features/filesystem/filesystem-service";
import {GtCfVaArSc, StCfVaArSc2} from "@schemas/schemas-config";

const ALLW_CFG_KYS = new Set(CFG_FLD_KYS);
const CDLO = process.env.FS_MCP_DEBUG_CONFIG === "1";
const SLSR = /\r?\n/;
const CTX_BOOL_KYS = new Set(["contextIndexEnabled", "contextIndexReplaceLargeOutputs"]);
const CTX_ZERO_KYS = new Set(["contextIndexAutoMinChars", "contextIndexAutoMinLines"]);
const CTX_POS_KYS = new Set(["contextIndexMaxBytes", "contextIndexMaxDocuments", "contextIndexMaxEntryChars"]);

// 1. Log config debug ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function logConfigDebug(message: string): void {
  if (CDLO) {
    console.error(message);
  }
}

// 1. Normalize array config value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeArrayConfigValue(key: string, value: unknown): unknown {
  let normVal2 = value;

  if (key === "allowedDirectories" && (value === null || (typeof value === "string" && value.trim().length === 0))) {
    normVal2 = [];
  }
  return normVal2;
}

// 2. Expand home path \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

// 3. Normalize path for containment \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
function normalizePathForContainment(value: string): string {
  return path.resolve(expandHomePath(value));
}

// 4. Is path inside \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
function isPathInside(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

// 5. Get default context index DB directory \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
function getDefaultContextIndexDbDirectory(): string {
  return normalizePathForContainment(path.dirname(gtDfCtIdDbPt()));
}

// 6. Validate context index DB path \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
function validateContextIndexDbPath(value: string, cfgOvrr?: SrvrCfg): void {
  const resolvedPath = normalizePathForContainment(value.trim());
  const defaultPath = normalizePathForContainment(gtDfCtIdDbPt());

  if (resolvedPath === defaultPath) {
    return;
  }
  if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
    throw new Error("contextIndexDbPath must point to a SQLite file, not a directory");
  }
  const config = cfgOvrr ?? cfgMgr.getConfigSync();
  const allwDrct = Array.isArray(config.allowedDirectories)
    ? config.allowedDirectories.filter((directory): directory is string => typeof directory === "string" && directory.trim().length > 0)
    : [];
  const allowedRoots = [
    getDefaultContextIndexDbDirectory(),
    ...allwDrct.map((directory) => normalizePathForContainment(directory)),
  ];

  if (!allowedRoots.some((rootPath) => isPathInside(rootPath, resolvedPath))) {
    throw new Error("contextIndexDbPath must stay under ~/.mcp or an allowedDirectories entry");
  }
  const parentDir = path.dirname(resolvedPath);

  if (!existsSync(parentDir)) {
    throw new Error("contextIndexDbPath parent directory must exist for custom paths");
  }
  if (!statSync(parentDir).isDirectory()) {
    throw new Error("contextIndexDbPath parent must be a directory");
  }
}

// 7. Normalize context index config value \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
function normalizeContextIndexConfigValue(key: string, value: unknown, cfgOvrr?: SrvrCfg): unknown {
  if (CTX_BOOL_KYS.has(key) && typeof value !== "boolean") {
    throw new Error(key + " must be a boolean");
  }
  if (key === "contextIndexDbPath") {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error("contextIndexDbPath must be a non-empty string");
    }
    validateContextIndexDbPath(value, cfgOvrr);
  }
  if (CTX_ZERO_KYS.has(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new Error(key + " must be a non-negative finite number");
  }
  if (CTX_POS_KYS.has(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 1)) {
    throw new Error(key + " must be a positive finite number");
  }
  return value;
}

// 2. Path exists ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, fsConstants.X_OK);
    return true;
  }
  catch {
    return false;
  }
}

// 3. Detect available shells ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function detectAvailableShells(systemInfo: ReturnType<typeof gtSystInf>): Promise<string[]> {
  const detected = new Set<string>();
  const add = (shell: string): void => {
    if (shell.trim().length > 0) {
      detected.add(shell.trim());
    }
  };

  add(systemInfo.defaultShell);

  if (systemInfo.isWindows) {
    add(process.env.ComSpec ?? "");
    const candidates = ["pwsh.exe", "cmd.exe", "bash.exe"];
    const systemRoot = process.env.SystemRoot?.trim();
    const programFiles = process.env.ProgramFiles?.trim();

    if (systemRoot && systemRoot.length > 0) {
      candidates.unshift(path.join(systemRoot, "System32", "cmd.exe"), path.join(systemRoot, "System32", "bash.exe"));
    }
    if (programFiles && programFiles.length > 0) {
      candidates.unshift(path.join(programFiles, "PowerShell", "7", "pwsh.exe"));
    }

    const availCndd = await Promise.all(
      candidates.map(async (shell) => {
        if (shell.includes("\\")) {
          return (await pathExists(shell)) ? shell : null;
        }
        return shell;
      }),
    );

    for (const shell of availCndd) {
      if (shell !== null) {
        add(shell);
      }
    }
    return [...detected];
  }
  add(process.env.SHELL ?? "");

  const shellFiles = ["/etc/shells"];
  const shllFlCntn = await Promise.all(
    shellFiles.map(async (shellFile) => {
      try {
        return await readFile(shellFile, "utf8");
      }
      catch {
        return null;
      }
    }),
  );

  for (const content of shllFlCntn) {
    if (content !== null) {
      content
        .split(SLSR)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .forEach(add);
    }
  }
  const fbCndd = ["/bin/zsh", "/bin/bash", "/bin/sh", "/usr/bin/fish"];
  const availFllb = await Promise.all(fbCndd.map(async (shell) => ((await pathExists(shell)) ? shell : null)));

  for (const shell of availFllb) {
    if (shell !== null) {
      add(shell);
    }
  }
  return [...detected];
}

// 4. Format config value ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatConfigValue(value: unknown): string {
  const srlzVal2 = JSON.stringify(value, null, 2);

  if (srlzVal2 !== undefined) {
    return srlzVal2;
  }
  return String(value);
}

// 5. Create system info snapshot ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createSystemInfoSnapshot(): ReturnType<typeof gtSystInf> & {
  memory: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
    external: string;
    arrayBuffers: string;
  };
} {
  const systemInfo = gtSystInf();
  const memoryUsage = process.memoryUsage();

  return {
    ...systemInfo,
    memory: {
      arrayBuffers: `${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    },
  };
}

// 6. Get config value ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getConfigValue(args: unknown): Promise<ServerResult> {
  logConfigDebug(`getConfigValue called with args: ${JSON.stringify(args)}`);
  const parsed = GtCfVaArSc.safeParse(args);

  if (!parsed.success) {
    logConfigDebug(`Invalid arguments for get_configs: ${parsed.error}`);
    return {
      content: [
        {
          text: `Invalid arguments: ${parsed.error}`,
          type: "text",
        },
      ],
      isError: true,
    };
  }
  try {
    const key = parsed.data.key as CfgQryKy;
    const definition = CFG_QRY_DFNT[key];
    let value: unknown;

    if (isCfgFldKy(key) || key === "version") {
      value = await cfgMgr.getValue(key);
    }
    else if (key === "currentClient") {
      value = gtCurClnt();
    }
    else if (key === "systemInfo") {
      value = createSystemInfoSnapshot();
    }
    else if (key === "availableShells") {
      const systemInfo = gtSystInf();

      value = await detectAvailableShells(systemInfo);
    }
    else {
      return {
        content: [
          {
            text: `Key "${key}" is not readable via this tool.`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
    logConfigDebug(`getConfigValue result for ${key}: ${formatConfigValue(value)}`);
    return {
      content: [
        {
          text: `${key}: ${formatConfigValue(value)}`,
          type: "text",
        },
      ],
      structuredContent: {
        description: definition.description,
        editable: definition.editable,
        key,
        label: definition.label,
        value,
        valueType: definition.valueType,
      },
    };
  }
  catch (error) {
    console.error(`Error in getConfigValue: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error instanceof Error && error.stack ? error.stack : "No stack trace available");
    return {
      content: [
        {
          text: `Error getting configuration value: ${error instanceof Error ? error.message : String(error)}`,
          type: "text",
        },
      ],
      isError: true,
    };
  }
}

// 8. Prepared config value update \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
export interface PreparedConfigValueUpdate {
  key: string;
  value: unknown;
}

// 9. Prepare config value update \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
export async function prepareConfigValueUpdate(args: unknown, cfgOvrr?: SrvrCfg): Promise<PreparedConfigValueUpdate> {
  const parsed = StCfVaArSc2.safeParse(args);

  if (!parsed.success) {
    logConfigDebug("Invalid arguments for set_config_value: " + parsed.error.message);
    throw new Error("Invalid arguments: " + parsed.error.message);
  }
  if (!isCfgFldKy(parsed.data.key)) {
    throw new Error("Key \"" + parsed.data.key + "\" is not configurable via this tool. Allowed keys: " + [...ALLW_CFG_KYS].join(", "));
  }
  const fldDfnt = CFG_FLD_DFNT[parsed.data.key];
  const rawValue = parsed.data.value !== undefined ? parsed.data.value : await rdFlInt(parsed.data.value_path ?? "", parsed.data.value_offset, parsed.data.value_length);
  let valueToStore = normalizeArrayConfigValue(parsed.data.key, rawValue);

  if (typeof valueToStore === "string" && (valueToStore.startsWith("[") || valueToStore.startsWith("{"))) {
    try {
      valueToStore = JSON.parse(valueToStore);
      logConfigDebug("Parsed string value to object/array: " + JSON.stringify(valueToStore));
    }
    catch (parseError) {
      logConfigDebug("Failed to parse string as JSON, using as-is: " + String(parseError));
    }
  }
  if (fldDfnt.valueType === "array" && !Array.isArray(valueToStore)) {
    if (typeof valueToStore === "string") {
      const origStr = valueToStore;

      try {
        valueToStore = JSON.parse(origStr);
      }
      catch (parseError) {
        logConfigDebug("Failed to parse string as array for " + parsed.data.key + ": " + String(parseError));
        if (!origStr.includes("[")) {
          valueToStore = [origStr];
        }
      }
    }
    else if (valueToStore !== null) {
      valueToStore = [String(valueToStore)];
    }
    if (!Array.isArray(valueToStore)) {
      logConfigDebug("Value for " + parsed.data.key + " is still not an array, converting to array");
      valueToStore = [String(valueToStore)];
    }
  }
  valueToStore = normalizeContextIndexConfigValue(parsed.data.key, valueToStore, cfgOvrr);

  return {
    key: parsed.data.key,
    value: valueToStore,
  };
}

// 10. Set config value \u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015\u2015
export async function setConfigValue(args: unknown): Promise<ServerResult> {
  logConfigDebug("setConfigValue called with args: " + JSON.stringify(args));
  try {
    const update = await prepareConfigValueUpdate(args);

    await cfgMgr.setValue(update.key, update.value);
    const updtCfg = await cfgMgr.getConfig();

    logConfigDebug("setConfigValue: Successfully set " + update.key + " to " + JSON.stringify(update.value));
    return {
      content: [
        {
          text: "Successfully set " + update.key + " to " + JSON.stringify(update.value, null, 2) + "\\n\\nUpdated configuration:\\n" + JSON.stringify(updtCfg, null, 2),
          type: "text",
        },
      ],
    };
  }
  catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    console.error("Error updating config: " + errMsg);
    return {
      content: [
        {
          text: "Error updating configuration value: " + errMsg,
          type: "text",
        },
      ],
      isError: true,
    };
  }
}
