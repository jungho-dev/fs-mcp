import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "../../out/features/config/config-store.mjs";
import { terminalManager } from "../../out/features/process/process-terminal-service.mjs";

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test output directory
const OUTPUT_DIR = path.join(__dirname, "..", "fixtures", "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "repl-test-output.txt");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

/**
 * Setup function to prepare for tests
 */
async function setup() {
  // Save original config to restore later
  const originalConfig = await configManager.getConfig();

  // Create output directory if it doesn't exist
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.warn(`${colors.yellow}Warning: Could not create output directory: ${error.message}${colors.reset}`);
  }

  return originalConfig;
}

/**
 * Teardown function to clean up after tests
 */
async function teardown(originalConfig) {
  // Reset configuration to original
  await configManager.updateConfig(originalConfig);
}

/**
 * Wait for the specified number of milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test Python REPL interaction
 */
async function testPythonREPL() {
  try {
    // Setup Python test
    // Find Python executable
    const pythonCmd = process.platform === "win32" ? "python" : "python3";

    // Start a Python REPL process
    const result = await terminalManager.executeCommand(`${pythonCmd} -i`, 5000);

    if (result.pid <= 0) {
      throw new Error(`Failed to start Python REPL: ${result.output}`);
    }

    // Wait for REPL to initialize
    await sleep(1000);

    // Send a command to the REPL with explicit Python print
    const testValue = Math.floor(Math.random() * 100);

    // Send two different commands to increase chances of seeing output
    let success = terminalManager.sendInputToProcess(result.pid, `print("STARTING PYTHON TEST")\n`);
    if (!success) {
      throw new Error("Failed to send initial input to Python REPL");
    }

    // Wait a bit between commands
    await sleep(1000);

    // Send the actual test command
    success = terminalManager.sendInputToProcess(result.pid, `print(f"REPL_TEST_VALUE: {${testValue} * 2}")\n`);
    if (!success) {
      throw new Error("Failed to send test input to Python REPL");
    }

    // Wait longer for the command to execute
    await sleep(3000);

    // Get output from the REPL
    const output = terminalManager.getNewOutput(result.pid);

    // Write output to file for inspection
    await fs.writeFile(OUTPUT_FILE, `Python REPL output:\n${output || "No output received"}`);

    // Terminate the REPL process
    const terminated = terminalManager.forceTerminate(result.pid);
    if (!terminated) {
      console.warn(`${colors.yellow}Warning: Could not terminate Python REPL process${colors.reset}`);
    } else {
    }

    // Check if we got the expected output
    if (output?.includes(`REPL_TEST_VALUE: ${testValue * 2}`)) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}Python REPL test error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test Node.js REPL interaction
 */
async function testNodeREPL() {
  try {
    // Start a Node.js REPL process
    const result = await terminalManager.executeCommand("node -i", 5000);

    if (result.pid <= 0) {
      throw new Error(`Failed to start Node.js REPL: ${result.output}`);
    }

    // Wait for REPL to initialize
    await sleep(1000);

    // Send commands to the Node.js REPL
    const testValue = Math.floor(Math.random() * 100);

    // Send multiple commands to increase chances of seeing output
    let success = terminalManager.sendInputToProcess(result.pid, `console.log("STARTING NODE TEST")\n`);
    if (!success) {
      throw new Error("Failed to send initial input to Node.js REPL");
    }

    // Wait a bit between commands
    await sleep(1000);

    // Send the actual test command
    success = terminalManager.sendInputToProcess(result.pid, `console.log("NODE_REPL_TEST_VALUE:", ${testValue} * 3)\n`);
    if (!success) {
      throw new Error("Failed to send test input to Node.js REPL");
    }

    // Wait longer for the command to execute
    await sleep(3000);

    // Get output from the REPL
    const output = terminalManager.getNewOutput(result.pid);

    // Append output to file for inspection
    await fs.appendFile(OUTPUT_FILE, `\n\nNode.js REPL output:\n${output || "No output received"}`);

    // Terminate the REPL process
    const terminated = terminalManager.forceTerminate(result.pid);
    if (!terminated) {
      console.warn(`${colors.yellow}Warning: Could not terminate Node.js REPL process${colors.reset}`);
    } else {
    }

    // Check if we got the expected output
    if (output?.includes(`NODE_REPL_TEST_VALUE: ${testValue * 3}`)) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}Node.js REPL test error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Run all REPL interaction tests
 */
export default async function runTests() {
  let originalConfig;
  try {
    originalConfig = await setup();

    const pythonTestResult = await testPythonREPL();
    const nodeTestResult = await testNodeREPL();

    // Overall test result
    const allPassed = pythonTestResult && nodeTestResult;

    return allPassed;
  } catch (error) {
    console.error(`${colors.red}Test execution error: ${error.message}${colors.reset}`);
    return false;
  } finally {
    if (originalConfig) {
      await teardown(originalConfig);
    }
  }
}

// If this file is run directly (not imported), execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error(`${colors.red}Unhandled error: ${error}${colors.reset}`);
    process.exit(1);
  });
}
