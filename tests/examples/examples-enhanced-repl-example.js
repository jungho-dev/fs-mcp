/**
 * This example demonstrates how to use the enhanced terminal commands
 * for REPL (Read-Eval-Print Loop) environments.
 */

import { forceTerminate, interactWithProcess, readProcessOutput, startProcess } from "../../out/features/process/process-runner.mjs";

// Example of starting and interacting with a Python REPL session
async function pythonREPLExample() {
  // Start Python interpreter in interactive mode
  const result = await startProcess({
    command: "python -i",
    timeout_ms: 10_000,
  });

  // Extract PID from the result text
  const pidMatch = result.content[0].text.match(/Process started with PID (\d+)/);
  const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;

  if (!pid) {
    console.error("Failed to get PID from Python process");
    return;
  }
  const _initialOutput = await readProcessOutput({
    pid,
    timeout_ms: 2000,
  });
  const _simpleResult = await interactWithProcess({
    pid,
    input: 'print("Hello from Python!")\n',
    wait_for_prompt: true,
    timeout_ms: 3000,
  });
  const multilineCode = `
def greet(name):
    return f"Hello, {name}!"

for i in range(3):
    print(greet(f"Guest {i+1}"))
`;

  const _multilineResult = await interactWithProcess({
    pid,
    input: `${multilineCode}\n`,
    wait_for_prompt: true,
    timeout_ms: 5000,
  });

  // Terminate the session
  await forceTerminate({ pid });
}

// Example of starting and interacting with a Node.js REPL session
async function nodeREPLExample() {
  // Start Node.js interpreter in interactive mode
  const result = await startProcess({
    command: "node -i",
    timeout_ms: 10_000,
  });

  // Extract PID from the result text
  const pidMatch = result.content[0].text.match(/Process started with PID (\d+)/);
  const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;

  if (!pid) {
    console.error("Failed to get PID from Node.js process");
    return;
  }
  const _initialOutput = await readProcessOutput({
    pid,
    timeout_ms: 2000,
  });
  const _simpleResult = await interactWithProcess({
    pid,
    input: 'console.log("Hello from Node.js!")\n',
    wait_for_prompt: true,
    timeout_ms: 3000,
  });
  const multilineCode = `
function greet(name) {
  return \`Hello, \${name}!\`;
}

for (let i = 0; i < 3; i++) {
  console.log(greet(\`Guest \${i+1}\`));
}
`;

  const _multilineResult = await interactWithProcess({
    pid,
    input: `${multilineCode}\n`,
    wait_for_prompt: true,
    timeout_ms: 5000,
  });

  // Terminate the session
  await forceTerminate({ pid });
}

// Run the examples
async function runExamples() {
  try {
    await pythonREPLExample();
    await nodeREPLExample();
  } catch (error) {
    console.error("Error running examples:", error);
  }
}

runExamples();
