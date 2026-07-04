/**
 * Test tool catalog composition remains stable after module refactors.
 */

import assert from "node:assert";
import path from "node:path";
import {fileURLToPath as flUrlTPth2} from "node:url";
import {CONFIG_TOOL_CATALOG as CFG_TL_CTLG} from "../../out/tools/tools-config.js";
import {FILESYSTEM_TOOL_CATALOG as FLSY_TL_CTLG} from "../../out/tools/tools-filesystem.js";
import {PROCESS_TOOL_CATALOG as PROC_TL_CTLG} from "../../out/tools/tools-process.js";
import {WEB_TOOL_CATALOG as WEB_TL_CTLG} from "../../out/tools/tools-web.js";

const __filename = flUrlTPth2(import.meta.url);

const EXP_TL_NMS = [
  "file-read",
  "file-read-line-range",
  "file-write",
  "dir-create",
  "dir-list",
  "path-copy",
  "path-move",
  "path-remove",
  "fs-search",
  "path-stat",
  "file-edit",
  "file-edit-lines",
  "fs-inspect",
  "web-fetch",
  "web-render",
  "web-extract",
  "download-to-file",
];

const BFTN = [
  "file-read",
  "file-read-line-range",
  "file-write",
  "dir-create",
  "dir-list",
  "path-copy",
  "path-move",
  "path-remove",
  "fs-search",
  "path-stat",
  "file-edit",
  "file-edit-lines",
  "web-fetch",
  "web-extract",
  "download-to-file",
];

const APPTN = [
  "file-edit",
];

// 1. Test tool catalog shape --------------------------------------------------------------------
function testToolCatalogShape() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...WEB_TL_CTLG];

  assert.strictEqual(tools.length, EXP_TL_NMS.length);
  assert.deepStrictEqual(
    tools.map((tool) => tool.name),
    EXP_TL_NMS,
  );
}

// 2. Test batch first descriptions ----------------------------------------------------------------
function testBatchFirstDescriptions() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...WEB_TL_CTLG];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const toolName of BFTN) {
    const tool = toolsByName.get(toolName);

    assert.ok(tool, `Missing tool: ${toolName}`);
    assert.match(tool.description, /Batch same-kind operations into one call\./, `Missing batch guidance: ${toolName}`);
  }
}

// 3. Test large edit guidance -------------------------------------------------------------------
function testLargeEditGuidance() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG, ...WEB_TL_CTLG];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const toolName of APPTN) {
    const tool = toolsByName.get(toolName);

    assert.ok(tool, `Missing tool: ${toolName}`);
    assert.match(tool.description, /For large or multi-file writes\/edits/, `Missing large edit guidance: ${toolName}`);
    assert.match(tool.description, /args_path/, `Missing args_path guidance: ${toolName}`);
  }
}

// 4. Run all tests ----------------------------------------------------------------------------
async function runAllTests() {
  testToolCatalogShape();
  testBatchFirstDescriptions();
  testLargeEditGuidance();
  return true;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename) {
  runAllTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

export default runAllTests;
