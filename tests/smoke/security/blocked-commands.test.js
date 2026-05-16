/**
 * Test script for blockedCommands configuration functionality
 *
 * This script tests how blockedCommands settings affect command execution:
 * 1. Testing execution of non-blocked commands
 * 2. Testing execution of blocked commands
 * 3. Testing updated blockedCommands list
 * 4. Testing empty blockedCommands array
 */

import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";
import { commandManager as cmdMgr2 } from "../../../out/features/process/process-command-policy.js";
import { startProcess } from "../../../out/features/process/process-runner.js";

// We need a wrapper because startProcess in tools/improved-process-tools.js returns a ServerResult
// but our tests expect to receive the actual command result

// 1. Execute command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function executeCommand(command, timeout_ms = 2000, shell = null) {
  const args = {
    command: command,
    timeout_ms: timeout_ms,
  };

  if (shell) {
    args.shell = shell;
  }

  return await startProcess(args);
}

import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";

// Get directory name
const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);

// Define test directory
const TEST_DIR = path.join(__dirname, "test_blocked_commands");

// Define some test commands
const SF_CMDS = ['echo "Hello World"', "pwd", "date"];

const POT_HRM_CMD = ["rm", "mkfs", "dd"];

// 1. Helper function to clean up test directories ―――――――――――――――――――――――――――――――――――――――――――――――――
async function cleanupTestDirectories() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }
  catch (error) {
    // Ignore errors if directory doesn't exist
    if (error.code !== "ENOENT") {
      console.error("Error during cleanup:", error);
    }
  }
}

// 2. Try command helper ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function tryCommand(command) {
  const pidPattern = /PID (\d+)/;
  try {
    const result = await executeCommand(command, null, 2000);

    // Check if the result indicates the command was blocked
    if (result.isError && result.content?.[0]?.text?.includes("Command not allowed")) {
      return {
        blocked: true,
        error: result.content[0].text,
      };
    }

    // Command was executed successfully
    return {
      blocked: false,
      output: result.content?.[0] ? result.content[0].text : "",
      pid: result.content?.[0]?.text ? Number.parseInt(result.content[0].text.match(pidPattern)?.[1] || "-1", 10) : -1,
    };
  }
  catch (error) {
    // Check if the error message indicates blocking
    if (error.message && (error.message.includes("Command not allowed") || error.message.includes("blocked by configuration"))) {
      return {
        blocked: true,
        error: error.message,
      };
    }
    // Otherwise it's another type of error
    throw error;
  }
}

// 3. Setup function to prepare the test environment ―――――――――――――――――――――――――――――――――――――――――――――――
async function setup() {
  // Clean up before tests
  await cleanupTestDirectories();

  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Create a test file in the directory
  await fs.writeFile(path.join(TEST_DIR, "test-file.txt"), "Test content");

  // Save original config to restore later
  const origCfg = await cfgMgr.getConfig();
  return origCfg;
}

// 4. Teardown function to clean up after tests ――――――――――――――――――――――――――――――――――――――――――――――――――――
async function teardown(origCfg) {
  // Reset configuration to original
  await cfgMgr.updateConfig(origCfg);

  // Clean up test directories
  await cleanupTestDirectories();
}

// 5. Test execution of non-blocked commands ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testNonBlockedCommands() {
  // Set blockedCommands to include specific harmful commands
  const blckCmds = ["rm -rf /", ":(){ :|:& };:", "> /dev/sda", "dd if=/dev/zero of=/dev/sda", "mkfs", "mkfs.ext4", "format"];

  await cfgMgr.setValue("blockedCommands", blckCmds);

  // Verify config was set correctly
  const config = await cfgMgr.getConfig();
  assert.deepStrictEqual(config.blockedCommands, blckCmds, "blockedCommands should be correctly set");

  // Try to execute safe commands
  await Promise.all(
    SF_CMDS.map(async (command) => {
      const result = await tryCommand(command);
      assert.strictEqual(result.blocked, false, `Command should not be blocked: ${command}`);
    }),
  );
}

// 6. Test execution of blocked commands ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testBlockedCommandsExecution() {
  // Set blockedCommands to block our test harmful commands
  const blckCmds = POT_HRM_CMD.slice();
  await cfgMgr.setValue("blockedCommands", blckCmds);

  // Verify config was set correctly
  const config = await cfgMgr.getConfig();
  assert.deepStrictEqual(config.blockedCommands, blckCmds, "blockedCommands should be correctly set");

  // We'll test this by directly checking against commandManager.validateCommand
  // since that's what determines if a command is blocked
  await Promise.all(
    POT_HRM_CMD.map(async (command) => {
      // Check validation directly
      const isAllowed = await cmdMgr2.validateCommand(command);

      // The command should NOT be allowed
      assert.strictEqual(isAllowed, false, `Command should be blocked: ${command}`);
    }),
  );
}

// 7. Test updating blockedCommands list ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testUpdatingBlockedCommands() {
  // Start with one blocked command
  const testCommand = "echo";
  await cfgMgr.setValue("blockedCommands", [testCommand]);

  // Verify the command is blocked
  const isAllowed1 = await cmdMgr2.validateCommand(testCommand);
  assert.strictEqual(isAllowed1, false, "Command should be blocked before update");

  // Update blockedCommands to empty array
  await cfgMgr.setValue("blockedCommands", []);

  // Verify the command is now allowed
  const isAllowed2 = await cmdMgr2.validateCommand(testCommand);
  assert.strictEqual(isAllowed2, true, "Command should be allowed after update");
}

// 8. Test empty blockedCommands array ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testEmptyBlockedCommands() {
  // Set blockedCommands to empty array
  await cfgMgr.setValue("blockedCommands", []);

  // Verify config was set correctly
  const config = await cfgMgr.getConfig();
  assert.deepStrictEqual(config.blockedCommands, [], "blockedCommands should be an empty array");

  // Try to execute both safe and potentially harmful commands
  const allCommands = [...SF_CMDS, ...POT_HRM_CMD];

  await Promise.all(
    allCommands.map(async (command) => {
      const isAllowed = await cmdMgr2.validateCommand(command);
      assert.strictEqual(isAllowed, true, `No commands should be blocked with empty blockedCommands: ${command}`);
    }),
  );
}

// 9. Main test function ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runBlockedCommandsTests() {
  // Test 1: Execution of non-blocked commands
  await testNonBlockedCommands();

  // Test 2: Execution of blocked commands
  await testBlockedCommandsExecution();

  // Test 3: Updating blockedCommands list
  await testUpdatingBlockedCommands();

  // Test 4: Empty blockedCommands array
  await testEmptyBlockedCommands();
}

// Export the main test function

// 11. Run tests ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export default async function runTests() {
  let origCfg;
  try {
    origCfg = await setup();
    await runBlockedCommandsTests();
  }
  catch (error) {
    console.error("Test failed:", error.message);
    return false;
  }
  finally {
    if (origCfg) {
      await teardown(origCfg);
    }
  }
  return true;
}

// If this file is run directly (not imported), execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
