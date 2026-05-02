import { forceTerminate, interactWithProcess, startProcess } from "../../out/features/process/process-runner.mjs";

async function testNodeREPL() {
  try {
    const startResult = await startProcess({
      command: "node -i",
      timeout_ms: 5000,
      shell: process.platform === "win32" ? "pwsh.exe" : "/bin/sh",
    });
    const pid = Number(startResult.content[0].text.match(/PID (\d+)/)?.[1]);
    const _result = await interactWithProcess({
      pid,
      input: 'console.log("Hello from Node.js!")',
      wait_for_prompt: true,
      timeout_ms: 5000,
    });
    const nodeCode = `
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
`;

    const _result2 = await interactWithProcess({
      pid,
      input: nodeCode,
      wait_for_prompt: true,
      timeout_ms: 10_000,
    });
    const _terminated = await forceTerminate({ pid });
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
  }
}

testNodeREPL();
