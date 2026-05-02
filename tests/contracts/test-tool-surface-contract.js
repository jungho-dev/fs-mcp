/**
 * @file tests/contracts/test-tool-surface-contract.js
 * @description Tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { createToolCatalog, getDispatchableToolNames } from "../../out/mcp/tools/tool-exports.mjs";

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

// 2. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testCatalogAndDispatcherAlignment();
}

main();
