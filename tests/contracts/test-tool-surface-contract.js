/**
 * @file tests/contracts/test-tool-surface-contract.js
 * @description Tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { createToolCatalog, getDispatchableToolNames, HISTORY_EXCLUDED_TOOL_NAMES, shouldRecordToolHistory } from "../../out/mcp/tools/tool-exports.mjs";

function sortedDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

// 1. catalog and dispatcher alignment ―――――――――――――――――――――――――――――――――――――――――――――――
function testCatalogAndDispatcherAlignment() {
  const catalogNames = createToolCatalog()
    .map((tool) => tool.name)
    .sort();
  const dispatchableNames = getDispatchableToolNames().sort();

  assert.deepEqual(sortedDifference(catalogNames, dispatchableNames), []);
  assert.deepEqual(sortedDifference(dispatchableNames, catalogNames), []);
  assert.equal(new Set(catalogNames).size, catalogNames.length);
}

// 2. history exclusion alignment ――――――――――――――――――――――――――――――――――――――――――――――――――――
function testHistoryExclusionAlignment() {
  const catalogNames = createToolCatalog()
    .map((tool) => tool.name)
    .sort();

  assert.deepEqual(sortedDifference([...HISTORY_EXCLUDED_TOOL_NAMES], catalogNames), []);
  assert.equal(shouldRecordToolHistory("read_file"), true);
  assert.equal(shouldRecordToolHistory("get_recent_tool_calls"), false);
}

// 3. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testCatalogAndDispatcherAlignment();
  testHistoryExclusionAlignment();
}

main();
