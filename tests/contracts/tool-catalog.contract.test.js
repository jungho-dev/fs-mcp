/**
 * Test tool catalog composition remains stable after module refactors.
 */

import assert from "node:assert";
import {CONFIG_TOOL_CATALOG} from "../../out/tools/tools-config.js";
import {CONTEXT_TOOL_CATALOG} from "../../out/tools/tools-context.js";
import {FILESYSTEM_TOOL_CATALOG} from "../../out/tools/tools-filesystem.js";
import {PROCESS_TOOL_CATALOG} from "../../out/tools/tools-process.js";

const EXPECTED_TOOL_NAMES = [
  "get_configs",
  "set_config_values",
  "index_contexts",
  "search_contexts",
  "list_contexts",
  "clear_contexts",
  "read_files",
  "write_files",
  "create_directories",
  "list_directories",
  "move_files",
  "rename_files",
  "remove_files",
  "start_searches",
  "get_search_results",
  "stop_searches",
  "list_searches",
  "get_file_infos",
  "edit_blocks",
  "start_processes",
  "read_process_outputs",
  "interact_with_processes",
  "list_sessions",
  "list_processes",
  "kill_processes",
];

const BATCH_FIRST_TOOL_NAMES = [
  "get_configs",
  "set_config_values",
  "index_contexts",
  "search_contexts",
  "read_files",
  "write_files",
  "create_directories",
  "list_directories",
  "move_files",
  "rename_files",
  "remove_files",
  "start_searches",
  "get_search_results",
  "stop_searches",
  "get_file_infos",
  "edit_blocks",
  "start_processes",
  "read_process_outputs",
  "interact_with_processes",
  "kill_processes",
];

// 1. Test tool catalog shape ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testToolCatalogShape() {
  const tools = [...CONFIG_TOOL_CATALOG, ...CONTEXT_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG];

  assert.strictEqual(tools.length, EXPECTED_TOOL_NAMES.length);
  assert.deepStrictEqual(
    tools.map((tool) => tool.name),
    EXPECTED_TOOL_NAMES,
  );
}

// 2. Test batch first descriptions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function testBatchFirstDescriptions() {
  const tools = [...CONFIG_TOOL_CATALOG, ...CONTEXT_TOOL_CATALOG, ...FILESYSTEM_TOOL_CATALOG, ...PROCESS_TOOL_CATALOG];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const toolName of BATCH_FIRST_TOOL_NAMES) {
    const tool = toolsByName.get(toolName);

    assert.ok(tool, `Missing tool: ${toolName}`);
    assert.match(tool.description, /BATCH-FIRST:/, `Missing batch guidance: ${toolName}`);
    assert.match(tool.description, /instead of calling this tool repeatedly/, `Missing repeat-call guidance: ${toolName}`);
  }
}

// 3. Run all tests ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runAllTests() {
  testToolCatalogShape();
  testBatchFirstDescriptions();
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

export default runAllTests;
