/**
 * @file tests/contracts/contracts-test-tool-surface-contract.js
 * @description Tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { CONFIG_TOOL_CATALOG } from "../../out/tools/tools-config.mjs";
import { getDispatchableToolNames } from "../../out/tools/tools-dispatcher.mjs";
import { FILESYSTEM_TOOL_CATALOG } from "../../out/tools/tools-filesystem.mjs";
import { PROCESS_TOOL_CATALOG } from "../../out/tools/tools-process.mjs";

function sortedDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

// 1. catalog and dispatcher alignment ―――――――――――――――――――――――――――――――――――――――――――――――
function testCatalogAndDispatcherAlignment() {
  const catalogNames = [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG]
    .map((tool) => tool.name)
    .sort();
  const dispatchableNames = getDispatchableToolNames().sort();

  assert.deepEqual(sortedDifference(catalogNames, dispatchableNames), []);
  assert.deepEqual(sortedDifference(dispatchableNames, catalogNames), []);
  assert.equal(new Set(catalogNames).size, catalogNames.length);
}

// 2. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testCatalogAndDispatcherAlignment();
}

main();
