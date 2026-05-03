import assert from "node:assert";
import { readProcessOutput, startProcess } from "../../out/features/process/process-runner.mjs";

const TEST_SHELL = process.platform === "win32" ? "pwsh.exe" : "/bin/sh";

/**
 * Proper test for read_process_output on completed processes
 *
 * This test should:
 * - FAIL when the bug exists (current behavior)
 * - PASS when the bug is fixed (desired behavior)
 */
async function testReadCompletedProcessOutput() {
  // Start echo command with delay, but timeout before echo happens
  const startResult = await startProcess({
    // Cross-platform delay + output using Node
    command: "node -e \"setTimeout(() => console.log('SUCCESS MESSAGE'), 1000)\"",
    timeout_ms: 500, // Returns before the output happens
    shell: TEST_SHELL,
  });

  // Extract PID
  const pidMatch = startResult.content[0].text.match(/Process started with PID (\d+)/);
  assert(pidMatch, "Should get PID from start_process");
  const pid = Number.parseInt(pidMatch[1], 10);

  // Wait for the actual command to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Try to read the output - this should work when fixed
  const readResult = await readProcessOutput({ pid, timeout_ms: 1000 });

  // ASSERT: Should be able to read from completed process
  assert(!readResult.isError, "Should be able to read from completed process without error");

  // ASSERT: Should contain the echo output
  assert(readResult.content[0].text.includes("SUCCESS MESSAGE"), "Should contain the echo output from completed process");
}

/**
 * Test immediate completion scenario
 */
async function testImmediateCompletion() {
  const startResult = await startProcess({
    command: "node -e \"console.log('IMMEDIATE OUTPUT')\"",
    timeout_ms: 2000,
    shell: TEST_SHELL,
  });

  // Extract PID
  const pidMatch = startResult.content[0].text.match(/Process started with PID (\d+)/);
  assert(pidMatch, "Should get PID from start_process");
  const pid = Number.parseInt(pidMatch[1], 10);

  // Small delay to ensure process completed
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Should be able to read from immediately completed process
  const readResult = await readProcessOutput({ pid, timeout_ms: 1000 });

  assert(!readResult.isError, "Should be able to read from immediately completed process");

  assert(readResult.content[0].text.includes("IMMEDIATE OUTPUT"), "Should contain immediate output from completed process");
}

// Run tests
async function runTests() {
  try {
    await testReadCompletedProcessOutput();
    await testImmediateCompletion();
    return true;
  } catch (_error) {
    return false;
  }
}

runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test error:", error);
    process.exit(1);
  });
