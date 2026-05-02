/**
 * Test startup log replay preserves original log levels.
 */

import assert from "node:assert";
import { flushStartupLogs } from "../../out/app/server/run-mcp-server.mjs";

function testFlushStartupLogsPreservesLevels() {
  const calls = [];
  const transport = {
    sendLog(level, message) {
      calls.push({ level, message });
    },
  };
  const messages = [
    { level: "error", message: "Failed to load configuration" },
    { level: "warning", message: "Continuing with in-memory configuration only" },
    { level: "debug", message: "Stack trace: example" },
  ];

  const sentMessages = flushStartupLogs(transport, messages);

  assert.deepStrictEqual(calls, [
    { level: "error", message: "Failed to load configuration" },
    { level: "warning", message: "Continuing with in-memory configuration only" },
    { level: "debug", message: "Stack trace: example" },
  ]);
  assert.deepStrictEqual(sentMessages, calls);
  assert.strictEqual(messages.length, 0);
}

async function runAllTests() {
  testFlushStartupLogsPreservesLevels();
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

export default runAllTests;
