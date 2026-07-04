/**
 * @file src/tools/tools-const.ts
 * @description Shared MCP tool catalog contracts and guidance text.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {getSystemInfo as gtSystInf} from "@cores/runtime/runtime-info";
import type {ZodTypeAny} from "zod";
import {zodToJsonSchema as zdTJsnSch} from "zod-to-json-schema";

const systemInfo = gtSystInf();

// -------------------------------------------------------------------------------------------------
export declare type ToolCatalogAnnotations = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};

// -------------------------------------------------------------------------------------------------
export declare type ToolCatalogEntry = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolCatalogAnnotations;
};

// -------------------------------------------------------------------------------------------------
export declare type ToolCatalogEntryConfig = {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  annotations: ToolCatalogAnnotations;
};

// -------------------------------------------------------------------------------------------------
function createCompactOsGuidance(): string {
  const baseGuidance = `Runtime: ${systemInfo.platformName}. Default shell: ${systemInfo.defaultShell}.`;

  if (systemInfo.isWindows) {
    return `${baseGuidance} On Windows, try cmd or pwsh.exe if commands fail.`;
  }
  if (systemInfo.isMacOS) {
    return `${baseGuidance} On macOS, Homebrew and python3 are common defaults.`;
  }
  return `${baseGuidance} On Linux, distro package managers and python3 are common defaults.`;
}

// -------------------------------------------------------------------------------------------------
function createCompactPathGuidance(): string {
  const mountedPaths = systemInfo.docker.mountPoints.map((mount) => mount.containerPath);
  if (mountedPaths.length > 0) {
    return `Use absolute paths. Prefer mounted paths in this container: ${mountedPaths.join(", ")}.`;
  }
  return "Use absolute paths. Relative paths depend on the current working directory.";
}

// -------------------------------------------------------------------------------------------------
function compactToolDescription(description: string): string {
  const cmpcLns = description
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1 && lines[index - 1]?.length > 0));

  return cmpcLns.join("\n");
}

// -------------------------------------------------------------------------------------------------
export function createToolCatalogEntry(config: ToolCatalogEntryConfig): ToolCatalogEntry {
  let cchdInptSch: Record<string, unknown> | undefined;

  return {
    annotations: config.annotations,
    description: compactToolDescription(config.description),
    get inputSchema() {
      cchdInptSch ??= zdTJsnSch(config.inputSchema);
      return cchdInptSch;
    },
    name: config.name,
  };
}

// -------------------------------------------------------------------------------------------------
export const OS_GUIDANCE = createCompactOsGuidance();

// -------------------------------------------------------------------------------------------------
export const PTH_GDNC = createCompactPathGuidance();

// -------------------------------------------------------------------------------------------------
export const BTCH_GDNC = "Batch same-kind operations into one call.";

// -------------------------------------------------------------------------------------------------
export const APPG = "For large or multi-file writes/edits, prefer fs-mcp batch tools with *_path or args_path.";

// -------------------------------------------------------------------------------------------------
export const CMD_PRF_DSC = "For large arguments, pass a UTF-8 JSON file via {\"args_path\":\"ABSOLUTE_PATH_TO_ARGS_JSON\"}.";
