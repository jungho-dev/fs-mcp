import { forceTerminate, interactWithProcess, startProcess } from "../../out/features/process/process-runner.mjs";

async function testBasicREPL() {
  try {
    const startResult = await startProcess({
      command: "python -i",
      timeout_ms: 5000,
      shell: process.platform === "win32" ? "pwsh.exe" : "/bin/sh",
    });
    const pid = Number(startResult.content[0].text.match(/PID (\d+)/)?.[1]);
    const _result = await interactWithProcess({
      pid,
      input: 'print("Hello from Python!")',
      wait_for_prompt: true,
      timeout_ms: 5000,
    });
    const _terminated = await forceTerminate({ pid });
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
  }
}

testBasicREPL();
