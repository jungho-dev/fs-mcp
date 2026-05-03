/**
 * Test tool catalog composition remains stable after module refactors.
 */

import assert from "node:assert";
import {createToolCatalog} from "../../out/mcp/tools/tool-catalog.mjs";

const EXPECTED_TOOL_NAMES = [
  "get_config",
  "set_config_values",
  "read_files",
  "write_files",
  "create_directories",
  "list_directories",
  "move_files",
  "start_searches",
  "get_search_results",
  "stop_searches",
  "list_searches",
  "get_file_infos",
  "edit_blocks",
  "start_processes",
  "read_process_outputs",
  "interact_with_processes",
  "force_terminate_processes",
  "list_sessions",
  "list_processes",
  "kill_processes",
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
