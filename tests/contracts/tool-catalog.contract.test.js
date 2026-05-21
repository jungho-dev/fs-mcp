/**
 * Test tool catalog composition remains stable after module refactors.
 */

import assert from "node:assert";
import path from "node:path";
import {fileURLToPath as flUrlTPth2} from "node:url";
import {CONFIG_TOOL_CATALOG as CFG_TL_CTLG} from "../../out/tools/tools-config.js";
import {FILESYSTEM_TOOL_CATALOG as FLSY_TL_CTLG} from "../../out/tools/tools-filesystem.js";
import {PROCESS_TOOL_CATALOG as PROC_TL_CTLG} from "../../out/tools/tools-process.js";

const __filename = flUrlTPth2(import.meta.url);

const EXP_TL_NMS = [
  "get_configs",
  "set_config_values",
  "read_files",
  "read_files_with_linenumber",
  "write_files",
  "create_directories",
  "list_directories",
  "copy_files",
  "move_files",
  "remove_files",
  "start_searches",
  "regex_searches",
  "get_full_search",
  "stop_searches",
  "get_file_infos",
  "edit_blocks",
  "start_processes",
  "read_process_outputs",
  "interact_with_processes",
  "list_sessions",
  "kill_processes",
];

const BFTN = [
  "get_configs",
  "set_config_values",
  "read_files",
  "read_files_with_linenumber",
  "write_files",
  "create_directories",
  "list_directories",
  "copy_files",
  "move_files",
  "remove_files",
  "start_searches",
  "regex_searches",
  "get_full_search",
  "stop_searches",
  "get_file_infos",
  "edit_blocks",
  "start_processes",
  "read_process_outputs",
  "interact_with_processes",
  "kill_processes",
];

const APPTN = [
  "edit_blocks",
];

// 1. Test tool catalog shape ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testToolCatalogShape() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG];

  assert.strictEqual(tools.length, EXP_TL_NMS.length);
  assert.deepStrictEqual(
    tools.map((tool) => tool.name),
    EXP_TL_NMS,
  );
}

// 2. Test batch first descriptions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testBatchFirstDescriptions() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const toolName of BFTN) {
    const tool = toolsByName.get(toolName);

    assert.ok(tool, `Missing tool: ${toolName}`);
    assert.match(tool.description, /Batch same-kind operations into one call\./, `Missing batch guidance: ${toolName}`);
  }
}

// 3. Test large edit guidance ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testLargeEditGuidance() {
  const tools = [...CFG_TL_CTLG, ...FLSY_TL_CTLG, ...PROC_TL_CTLG];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const toolName of APPTN) {
    const tool = toolsByName.get(toolName);

    assert.ok(tool, `Missing tool: ${toolName}`);
    assert.match(tool.description, /For large or multi-file writes\/edits/, `Missing large edit guidance: ${toolName}`);
    assert.match(tool.description, /args_path/, `Missing args_path guidance: ${toolName}`);
  }
}

// 4. Run all tests ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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
