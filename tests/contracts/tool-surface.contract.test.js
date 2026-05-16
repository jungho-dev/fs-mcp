/**
 * @file tests/contracts/tool-surface.contract.test.js
 * @description Tool surface contract tests.
 * @author JUNGHO
 * @since 2026-05-02
 */

import assert from "node:assert/strict";
import { CONFIG_TOOL_CATALOG as CFG_TL_CTLG } from "../../out/tools/tools-config.js";
import { CONTEXT_TOOL_CATALOG as CTX_TL_CTLG } from "../../out/tools/tools-context.js";
import { getDispatchableToolNames as gtDsptTlNms } from "../../out/tools/tools-dispatcher.js";
import { FILESYSTEM_TOOL_CATALOG as FLSY_TL_CTLG } from "../../out/tools/tools-filesystem.js";
import { GIT_TOOL_CATALOG as GT_TL_CTLG } from "../../out/tools/tools-git.js";
import { PROCESS_TOOL_CATALOG as PROC_TL_CTLG } from "../../out/tools/tools-process.js";

const EGTN2 = [
  "git_add",
  "git_commit",
  "git_diff",
  "git_set_working_dir",
  "git_show",
  "git_status",
];

// 1. Sorted difference ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function sortedDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

// 1. catalog and dispatcher alignment ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testCatalogAndDispatcherAlignment() {
  const catalogNames = [...CFG_TL_CTLG, ...CTX_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...GT_TL_CTLG]
    .map((tool) => tool.name)
    .sort();
  const dsptNms = gtDsptTlNms().sort();

  assert.deepEqual(sortedDifference(catalogNames, dsptNms), []);
  assert.deepEqual(sortedDifference(dsptNms, catalogNames), []);
  assert.equal(new Set(catalogNames).size, catalogNames.length);
}

// 2. shared args_path schema exposure ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testArgsPathSchemaExposure() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...GT_TL_CTLG];

  for (const tool of tools) {
    assert.equal(JSON.stringify(tool.inputSchema).includes("args_path"), true, `${tool.name} must expose args_path`);
  }
}

// 3. essential git surface ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testEssentialGitSurface() {
  const gitToolNames = GT_TL_CTLG.map((tool) => tool.name).sort();

  assert.deepEqual(gitToolNames, EGTN2.toSorted());
}

// 4. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function main() {
  testCatalogAndDispatcherAlignment();
  testArgsPathSchemaExposure();
  testEssentialGitSurface();
}

main();
