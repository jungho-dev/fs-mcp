import assert from "node:assert";
import { execSync } from "node:child_process";
import { forceTerminate, interactWithProcess, readProcessOutput, startProcess } from "../../out/features/process/process-runner.mjs";

/**
 * Determines the correct python command to use
 * @returns {string}
 */
function getPythonCommand() {
  const candidates =
    process.platform === "win32"
      ? [
          { check: "where python3", run: "python3" },
          { check: "where python", run: "python" },
          { check: "where py", run: "py -3" },
        ]
      : [
          { check: "command -v python3", run: "python3" },
          { check: "command -v python", run: "python" },
        ];

  let selectedCommand = "";
  for (const candidate of candidates) {
    try {
      execSync(candidate.check, { stdio: "ignore" });
      selectedCommand = candidate.run;
      break;
    } catch (_error) {
      // Continue with next candidate
    }
  }

  if (!selectedCommand) {
    throw new Error("No Python command is available in the PATH");
  }

  return selectedCommand;
}

function getShellForPlatform() {
  const shellName = process.platform === "win32" ? "pwsh.exe" : "/bin/bash";
  return shellName;
}

/**
 * Test enhanced REPL functionality
 */
async function testEnhancedREPL() {
  const pythonCommand = getPythonCommand();
  const result = await startProcess({
    command: `${pythonCommand} -i`,
    timeout_ms: 10_000,
    shell: getShellForPlatform(),
  });

  // Extract PID from the result text
  const pidMatch = result.content[0].text.match(/Process started with PID (\d+)/);
  const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;

  if (!pid) {
    console.error("Failed to get PID from Python process");
    return false;
  }
  const _initialOutput = await readProcessOutput({
    pid,
    timeout_ms: 2000,
  });
  const inputResult = await interactWithProcess({
    pid,
    input: 'print("Hello from Python with wait!")',
    wait_for_prompt: true,
    timeout_ms: 5000,
  });

  // Check that the output contains the expected text
  assert(inputResult.content[0].text.includes("Hello from Python with wait!"), "Output should contain the printed message");
  await interactWithProcess({
    pid,
    input: 'print("Hello from Python without wait!")',
    wait_for_prompt: false,
  });

  // Wait a moment for Python to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Read the output
  const output = await readProcessOutput({ pid });

  // Check that the output contains the expected text
  assert(output.content[0].text.includes("Hello from Python without wait!"), "Output should contain the printed message");
  const multilineCode = `def greet(name):
    return f"Hello, {name}!"

for i in range(3):
    print(greet(f"Guest {i+1}"))`;

  // Send the multi-line code
  await interactWithProcess({
    pid,
    input: multilineCode,
    wait_for_prompt: true,
    timeout_ms: 5000,
  });

  // Send an empty line to complete and execute the block
  const multilineResult = await interactWithProcess({
    pid,
    input: "",
    wait_for_prompt: true,
    timeout_ms: 5000,
  });

  // Check that the output contains all three greetings
  assert(multilineResult.content[0].text.includes("Hello, Guest 1!"), "Output should contain greeting for Guest 1");
  assert(multilineResult.content[0].text.includes("Hello, Guest 2!"), "Output should contain greeting for Guest 2");
  assert(multilineResult.content[0].text.includes("Hello, Guest 3!"), "Output should contain greeting for Guest 3");
  await forceTerminate({ pid });

  return true;
}

// Run the test
testEnhancedREPL()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test error:", error);
    process.exit(1);
  });
