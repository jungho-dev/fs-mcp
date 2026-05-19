/**
 * @file tests/scripts/scripts-verify-tool-surface.mjs
 * @description Tool surface verification script.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { CONFIG_TOOL_CATALOG as CFG_TL_CTLG } from "../../out/tools/tools-config.js";
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
  const catalogNames = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...GT_TL_CTLG, ...PROC_TL_CTLG]
    .map((tool) => tool.name)
    .sort();
  const dsptNms = gtDsptTlNms().sort();
  const failures = [];

  const dplcCtlgNms = findDuplicates(catalogNames);
  if (dplcCtlgNms.length > 0) {
    failures.push(`Duplicate catalog tool names: ${dplcCtlgNms.join(", ")}`);
  }

  const mssnDspt = difference(catalogNames, dsptNms);
  if (mssnDspt.length > 0) {
    failures.push(`Catalog tools without dispatchers: ${mssnDspt.join(", ")}`);
  }

  const stlDspt = difference(dsptNms, catalogNames);
  if (stlDspt.length > 0) {
    failures.push(`Dispatchers missing from catalog: ${stlDspt.join(", ")}`);
  }

  const gitToolNames = GT_TL_CTLG.map((tool) => tool.name).sort();
  const mssnGtTls = difference(EGTN2, gitToolNames);
  const extrGtTls = difference(gitToolNames, EGTN2);
  if (mssnGtTls.length > 0 || extrGtTls.length > 0) {
    failures.push(`Git tool surface mismatch. Missing: ${mssnGtTls.join(", ") || "none"}; Extra: ${extrGtTls.join(", ") || "none"}`);
  }

  const tlsMsArPt = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...GT_TL_CTLG, ...PROC_TL_CTLG]
    .filter((tool) => !JSON.stringify(tool.inputSchema).includes("args_path"))
    .map((tool) => tool.name)
    .sort();
  if (tlsMsArPt.length > 0) {
    failures.push(`Tools missing args_path schema: ${tlsMsArPt.join(", ")}`);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
}

verifyToolSurface();
