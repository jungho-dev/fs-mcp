/**
 * Main test runner script
 * Runs all test modules and provides comprehensive summary
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const testConfigRoot = path.join(projectRoot, ".tmp", "test-config");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
};

/**
 * Run a command and return its output
 */
function _runCommand(command, args, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function sanitizeTestFileName(testFile) {
  return testFile.replace(/[^a-z0-9_-]+/gi, "-");
}

async function prepareTestConfigDir(testFile) {
  const configDir = path.join(testConfigRoot, sanitizeTestFileName(testFile));

  await fs.rm(configDir, { recursive: true, force: true });
  await fs.mkdir(configDir, { recursive: true });

  return configDir;
}

/**
 * Run a single Node.js test file as a subprocess
 */
async function runTestFile(testFile) {
  const configDir = await prepareTestConfigDir(testFile);

  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn("node", [testFile], {
      cwd: __dirname,
      env: {
        ...process.env,
        FS_MCP_CONFIG_DIR: configDir,
      },
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        resolve({ success: true, file: testFile, duration, exitCode: code });
      } else {
        console.error(`${colors.red}Test failed: ${testFile} (${duration}ms) - Exit code: ${code}${colors.reset}`);
        resolve({ success: false, file: testFile, duration, exitCode: code });
      }
    });

    proc.on("error", (err) => {
      const duration = Date.now() - startTime;
      console.error(`${colors.red}Error running ${testFile}: ${err.message}${colors.reset}`);
      resolve({ success: false, file: testFile, duration, error: err.message });
    });
  });
}

/**
 * Build the project
 */
async function buildProject() {
  await new Promise((resolve, reject) => {
    const proc = spawn("bun", ["run", "scripts/build.ts"], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on("error", (error) => {
      reject(error);
    });
  });
}

const testDiscoveryIgnoredDirectories = new Set(["fixtures", "scripts"]);

function toTestModulePath(filePath) {
  return `./${path.relative(__dirname, filePath).split(path.sep).join("/")}`;
}

async function collectTestFiles(directoryPath, results = []) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (!testDiscoveryIgnoredDirectories.has(entry.name)) {
        await collectTestFiles(entryPath, results);
      }
      continue;
    }

    const isRunnableTest = entry.name.startsWith("test") && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) && entry.name !== "run-all-tests.js";

    if (isRunnableTest) {
      results.push(toTestModulePath(entryPath));
    }
  }

  return results;
}

/**
 * Discover and run all test modules
 */
async function runTestModules() {
  // Discover all test files
  const testFiles = [];
  try {
    const discoveredTests = (await collectTestFiles(__dirname)).sort();
    const prioritizedMainTest = "./edit/test-edit-block-basic.js";

    if (discoveredTests.includes(prioritizedMainTest)) {
      testFiles.push(prioritizedMainTest);
      discoveredTests.splice(discoveredTests.indexOf(prioritizedMainTest), 1);
    }

    // Add remaining tests
    testFiles.push(...discoveredTests);
  } catch (error) {
    console.error(`${colors.red}Error: Could not scan test directory: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  if (testFiles.length === 0) {
    console.warn(`${colors.yellow}Warning: No test files found${colors.reset}`);
    return { success: true, results: [] };
  }
  testFiles.forEach((_file) => {});

  // Results tracking
  const results = [];
  let totalDuration = 0;

  // Run each test file
  for (const testFile of testFiles) {
    const result = await runTestFile(testFile);
    results.push(result);
    totalDuration += result.duration || 0;
  }

  // Calculate summary statistics
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const failedTests = results.filter((r) => !r.success);

  // Failed tests details
  if (failed > 0) {
    failedTests.forEach((test) => {
      if (test.exitCode !== undefined) {
      }
      if (test.error) {
      }
    });
  }

  // Test performance summary
  if (results.length > 0) {
    const _avgDuration = totalDuration / results.length;
    const _slowestTest = results.reduce((prev, current) => ((current.duration || 0) > (prev.duration || 0) ? current : prev));
    const _fastestTest = results.reduce((prev, current) => ((current.duration || 0) < (prev.duration || 0) ? current : prev));
  }

  // Final status
  if (failed === 0) {
  } else {
  }

  return {
    success: failed === 0,
    results,
    summary: {
      total: passed + failed,
      passed,
      failed,
      duration: totalDuration,
    },
  };
}

/**
 * Main function
 */
async function main() {
  const overallStartTime = Date.now();

  try {
    // Build the project first
    await buildProject();

    // Run all test modules
    const testResult = await runTestModules();

    // Final timing
    const _overallDuration = Date.now() - overallStartTime;

    // Exit with appropriate code
    process.exit(testResult.success ? 0 : 1);
  } catch (error) {
    console.error(`\n${colors.red}${colors.bold}FATAL ERROR:${colors.reset}`);
    console.error(`${colors.red}${error.message}${colors.reset}`);
    if (error.stack) {
      console.error(`${colors.red}${error.stack}${colors.reset}`);
    }
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on("uncaughtException", (error) => {
  console.error(`\n${colors.red}${colors.bold}UNCAUGHT EXCEPTION:${colors.reset}`);
  console.error(`${colors.red}${error.message}${colors.reset}`);
  if (error.stack) {
    console.error(`${colors.red}${error.stack}${colors.reset}`);
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason, _promise) => {
  console.error(`\n${colors.red}${colors.bold}UNHANDLED REJECTION:${colors.reset}`);
  console.error(`${colors.red}${reason}${colors.reset}`);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error(`\n${colors.red}${colors.bold}MAIN FUNCTION ERROR:${colors.reset}`);
  console.error(`${colors.red}${error.message}${colors.reset}`);
  if (error.stack) {
    console.error(`${colors.red}${error.stack}${colors.reset}`);
  }
  process.exit(1);
});
