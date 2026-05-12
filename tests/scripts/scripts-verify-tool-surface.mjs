/**
 * @file tests/scripts/scripts-verify-tool-surface.mjs
 * @description Tool surface verification script.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { CONFIG_TOOL_CATALOG } from "../../out/tools/tools-config.js";
import { CONTEXT_TOOL_CATALOG } from "../../out/tools/tools-context.js";
import { getDispatchableToolNames } from "../../out/tools/tools-dispatcher.js";
import { FILESYSTEM_TOOL_CATALOG } from "../../out/tools/tools-filesystem.js";
import { GIT_TOOL_CATALOG } from "../../out/tools/tools-git.js";
import { PROCESS_TOOL_CATALOG } from "../../out/tools/tools-process.js";

const EXPECTED_GIT_TOOL_NAMES = [
  "git_add",
  "git_clear_working_dir",
  "git_commit",
  "git_diff",
  "git_log",
  "git_set_working_dir",
  "git_show",
  "git_status",
  "git_wrapup_instructions",
];

// 1. collection helpers ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

// 2. Difference ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

// 2. tool surface check ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function verifyToolSurface() {
  const catalogNames = [...CONFIG_TOOL_CATALOG, ...CONTEXT_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...GIT_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG]
    .map((tool) => tool.name)
    .sort();
  const dispatchableNames = getDispatchableToolNames().sort();
  const failures = [];

  const duplicateCatalogNames = findDuplicates(catalogNames);
  if (duplicateCatalogNames.length > 0) {
    failures.push(`Duplicate catalog tool names: ${duplicateCatalogNames.join(", ")}`);
  }

  const missingDispatchers = difference(catalogNames, dispatchableNames);
  if (missingDispatchers.length > 0) {
    failures.push(`Catalog tools without dispatchers: ${missingDispatchers.join(", ")}`);
  }

  const staleDispatchers = difference(dispatchableNames, catalogNames);
  if (staleDispatchers.length > 0) {
    failures.push(`Dispatchers missing from catalog: ${staleDispatchers.join(", ")}`);
  }

  const gitToolNames = GIT_TOOL_CATALOG.map((tool) => tool.name).sort();
  const missingGitTools = difference(EXPECTED_GIT_TOOL_NAMES, gitToolNames);
  const extraGitTools = difference(gitToolNames, EXPECTED_GIT_TOOL_NAMES);
  if (missingGitTools.length > 0 || extraGitTools.length > 0) {
    failures.push(`Git tool surface mismatch. Missing: ${missingGitTools.join(", ") || "none"}; Extra: ${extraGitTools.join(", ") || "none"}`);
  }

  const toolsMissingArgsPath = [...CONFIG_TOOL_CATALOG, ...CONTEXT_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...GIT_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG]
    .filter((tool) => !JSON.stringify(tool.inputSchema).includes("args_path"))
    .map((tool) => tool.name)
    .sort();
  if (toolsMissingArgsPath.length > 0) {
    failures.push(`Tools missing args_path schema: ${toolsMissingArgsPath.join(", ")}`);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
}

verifyToolSurface();
