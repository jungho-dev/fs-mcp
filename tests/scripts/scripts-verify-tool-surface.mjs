/**
 * @file tests/scripts/scripts-verify-tool-surface.mjs
 * @description Tool surface verification script.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { CONFIG_TOOL_CATALOG } from "../../out/tools/tools-config.js";
import { getDispatchableToolNames } from "../../out/tools/tools-dispatcher.js";
import { FILESYSTEM_TOOL_CATALOG } from "../../out/tools/tools-filesystem.js";
import { GIT_TOOL_CATALOG } from "../../out/tools/tools-git.js";
import { PROCESS_TOOL_CATALOG } from "../../out/tools/tools-process.js";

// 1. collection helpers ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

// 2. tool surface check ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function verifyToolSurface() {
  const catalogNames = [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...GIT_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG]
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

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
}

verifyToolSurface();
