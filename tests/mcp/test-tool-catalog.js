/**
 * Test tool catalog composition remains stable after module refactors.
 */

import assert from "node:assert";
import {createToolCatalog} from "../../out/mcp/tools/tool-catalog.mjs";

const EXPECTED_TOOL_NAMES = [
  "get_config",
  "set_config_value",
  "read_file",
  "read_multiple_files",
  "write_file",
  "create_directory",
  "list_directory",
  "move_file",
  "start_search",
  "get_more_search_results",
  "stop_search",
  "list_searches",
  "get_file_info",
  "edit_block",
  "start_process",
  "read_process_output",
  "interact_with_process",
  "force_terminate",
  "list_sessions",
  "list_processes",
  "kill_process",
  "get_recent_tool_calls",
];

function testToolCatalogShape() {
  const tools = createToolCatalog();

  assert.strictEqual(tools.length, EXPECTED_TOOL_NAMES.length);
  assert.deepStrictEqual(
    tools.map((tool) => tool.name),
    EXPECTED_TOOL_NAMES,
  );
}

async function runAllTests() {
  testToolCatalogShape();
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

export default runAllTests;
