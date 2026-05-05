/**
 * @file tests/contracts/tool-surface.contract.test.js
 * @description Tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { CONFIG_TOOL_CATALOG } from "../../out/tools/tools-config.js";
import { getDispatchableToolNames } from "../../out/tools/tools-dispatcher.js";
import { FILESYSTEM_TOOL_CATALOG } from "../../out/tools/tools-filesystem.js";
import { GIT_TOOL_CATALOG } from "../../out/tools/tools-git.js";
import { PROCESS_TOOL_CATALOG } from "../../out/tools/tools-process.js";

function sortedDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

// 1. catalog and dispatcher alignment ―――――――――――――――――――――――――――――――――――――――――――――――
function testCatalogAndDispatcherAlignment() {
  const catalogNames = [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG, ...GIT_TOOL_CATALOG]
    .map((tool) => tool.name)
    .sort();
  const dispatchableNames = getDispatchableToolNames().sort();

  assert.deepEqual(sortedDifference(catalogNames, dispatchableNames), []);
  assert.deepEqual(sortedDifference(dispatchableNames, catalogNames), []);
  assert.equal(new Set(catalogNames).size, catalogNames.length);
}

// 2. shared args_path schema exposure ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testArgsPathSchemaExposure() {
  const tools = [...CONFIG_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG, ...GIT_TOOL_CATALOG];

  for (const tool of tools) {
    assert.equal(JSON.stringify(tool.inputSchema).includes("args_path"), true, `${tool.name} must expose args_path`);
  }
}

// 3. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testCatalogAndDispatcherAlignment();
  testArgsPathSchemaExposure();
}

main();
