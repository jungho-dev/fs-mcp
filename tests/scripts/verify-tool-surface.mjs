/**
 * @file tests/scripts/verify-tool-surface.mjs
 * @description Tool surface verification script.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { createToolCatalog, getDispatchableToolNames, HISTORY_EXCLUDED_TOOL_NAMES } from "../../out/mcp/tools/tool-exports.mjs";

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
  const catalogNames = createToolCatalog()
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

  const unknownHistoryExclusions = difference([...HISTORY_EXCLUDED_TOOL_NAMES], catalogNames);
  if (unknownHistoryExclusions.length > 0) {
    failures.push(`History exclusions missing from catalog: ${unknownHistoryExclusions.join(", ")}`);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
}

verifyToolSurface();
