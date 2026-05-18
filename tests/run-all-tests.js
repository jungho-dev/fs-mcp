/**
 * Curated runnable test runner.
 * Keeps the release-critical suite explicit without scanning the entire tests tree.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const shldSkpBld = process.env.FS_MCP_SKIP_BUILD === "1";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const TEST_GROUPS = {
  contracts: [
    "./contracts/batch-tool.contract.test.js",
    "./contracts/client-compat.contract.test.js",
    "./contracts/context-index.contract.test.js",
    "./contracts/server-instructions.contract.test.js",
    "./contracts/tool-catalog.contract.test.js",
    "./contracts/tool-result-response.contract.test.js",
    "./contracts/tool-routing.contract.test.js",
    "./contracts/tool-surface.contract.test.js",
    "./contracts/version.contract.test.js",
  ],
  smoke: [
    "./smoke/config/allowed-directories.test.js",
    "./smoke/edit/edit-block-basic.test.js",
    "./smoke/filesystem/file-handlers.test.js",
    "./smoke/git/git-basic.test.js",
    "./smoke/process/list-processes.test.js",
    "./smoke/process/virtual-node-session.test.js",
    "./smoke/search/search-code.test.js",
    "./smoke/search/search-truncation.test.js",
    "./smoke/security/blocked-commands.test.js",
    "./smoke/security/blocklist-bypass.test.js",
    "./smoke/security/symlink-security.test.js",
  ],
};
const RNNB_TSTS = Object.values(TEST_GROUPS).flat();

// 1. Write stdout ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

// 2. Write stderr ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

// 3. Run test file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runTestFile(testFile) {
  writeStdout(`\n${colors.cyan}Running ${testFile}${colors.reset}`);

  return await new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn("bun", [testFile], {
      cwd: __dirname,
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        resolve({ success: true, file: testFile, duration, exitCode: code });
      }
      else {
        writeStderr(`${colors.red}Test failed: ${testFile} (${duration}ms) - Exit code: ${code}${colors.reset}`);
        resolve({ success: false, file: testFile, duration, exitCode: code });
      }
    });

    proc.on("error", (error) => {
      const duration = Date.now() - startTime;
      writeStderr(`${colors.red}Error running ${testFile}: ${error.message}${colors.reset}`);
      resolve({ success: false, file: testFile, duration, error: error.message });
    });
  });
}

// 4. Run build command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runBuildCommand(args) {
  await new Promise((resolve, reject) => {
    const proc = spawn("bun", args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      }
      else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on("error", (error) => {
      reject(error);
    });
  });
}

// 5. Build project ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function buildProject() {
  await runBuildCommand(["x", "swc", "./src", "-d", "./out", "--config-file", "./.server.swcrc", "--strip-leading-paths", "--out-file-extension", "js", "--delete-dir-on-start"]);
  await runBuildCommand(["x", "tsc-alias", "-p", "tsconfig.json", "--outDir", "./out", "-f", "-fe", ".js"]);
  await fs.rename(path.join(projectRoot, "out", "index.js"), path.join(projectRoot, "out", "index.mjs"));
}

// 6. Run smoke tests ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runSmokeTests() {
  if (RNNB_TSTS.length === 0) {
    writeStderr(`${colors.yellow}Warning: No runnable tests configured${colors.reset}`);
    return { success: true, results: [], summary: { total: 0, passed: 0, failed: 0, duration: 0 } };
  }

  const results = [];
  let ttlDrtn = 0;

  for (const testFile of RNNB_TSTS) {
    // biome-ignore lint/performance/noAwaitInLoops: Smoke tests mutate config and process state, so they must run sequentially.
    const result = await runTestFile(testFile);
    results.push(result);
    ttlDrtn += result.duration ?? 0;
  }

  const passed = results.filter((result) => result.success).length;
  const failedTests = results.filter((result) => !result.success);

  writeStdout(`\n${colors.bold}Runnable suite:${colors.reset} ${passed}/${results.length} passed in ${ttlDrtn}ms`);

  if (failedTests.length > 0) {
    for (const failedTest of failedTests) {
      writeStderr(`${colors.red}- ${failedTest.file}${colors.reset}`);
    }
  }

  return {
    success: failedTests.length === 0,
    results,
    summary: {
      total: results.length,
      passed,
      failed: failedTests.length,
      duration: ttlDrtn,
    },
  };
}

// 7. Main ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  try {
    if (shldSkpBld) {
      writeStderr(`${colors.yellow}Skipping build because FS_MCP_SKIP_BUILD=1${colors.reset}`);
    }
    else {
      await buildProject();
    }

    const testResult = await runSmokeTests();
    process.exit(testResult.success ? 0 : 1);
  }
  catch (error) {
    writeStderr(`\n${colors.red}${colors.bold}FATAL ERROR:${colors.reset}`);
    writeStderr(`${colors.red}${error.message}${colors.reset}`);

    if (error.stack) {
      writeStderr(`${colors.red}${error.stack}${colors.reset}`);
    }

    process.exit(1);
  }
}

process.on("uncaughtException", (error) => {
  writeStderr(`\n${colors.red}${colors.bold}UNCAUGHT EXCEPTION:${colors.reset}`);
  writeStderr(`${colors.red}${error.message}${colors.reset}`);

  if (error.stack) {
    writeStderr(`${colors.red}${error.stack}${colors.reset}`);
  }

  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  writeStderr(`\n${colors.red}${colors.bold}UNHANDLED REJECTION:${colors.reset}`);
  writeStderr(`${colors.red}${String(reason)}${colors.reset}`);
  process.exit(1);
});

main().catch((error) => {
  writeStderr(`\n${colors.red}${colors.bold}MAIN FUNCTION ERROR:${colors.reset}`);
  writeStderr(`${colors.red}${error.message}${colors.reset}`);

  if (error.stack) {
    writeStderr(`${colors.red}${error.stack}${colors.reset}`);
  }

  process.exit(1);
});
