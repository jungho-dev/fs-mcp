/**
 * This example demonstrates how to use terminal commands to interact with a REPL environment
 * without needing specialized REPL tools.
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
  const _initialOutput = await readProcessOutput({ pid });
  await interactWithProcess({
    pid,
    input: 'print("Hello from Python!")\n',
  });

  // Wait a moment for Python to process
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Read the output
  const _output = await readProcessOutput({ pid });
  const multilineCode = `
def greet(name):
    return f"Hello, {name}!"

for i in range(3):
    print(greet(f"Guest {i+1}"))
`;

  await interactWithProcess({
    pid,
    input: `${multilineCode}\n`,
  });

  // Wait a moment for Python to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Read the output
  const _multilineOutput = await readProcessOutput({ pid });

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
  const _initialOutput = await readProcessOutput({ pid });
  await interactWithProcess({
    pid,
    input: 'console.log("Hello from Node.js!")\n',
  });

  // Wait a moment for Node.js to process
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Read the output
  const _output = await readProcessOutput({ pid });
  const multilineCode = `
function greet(name) {
  return \`Hello, \${name}!\`;
}

for (let i = 0; i < 3; i++) {
  console.log(greet(\`Guest \${i+1}\`));
}
`;

  await interactWithProcess({
    pid,
    input: `${multilineCode}\n`,
  });

  // Wait a moment for Node.js to process
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Read the output
  const _multilineOutput = await readProcessOutput({ pid });

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
