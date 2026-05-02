import { forceTerminate, interactWithProcess, readProcessOutput, startProcess } from "../../out/features/process/process-runner.mjs";

async function simplePythonTest() {
  try {
    // Run Python with a print command directly
    const _result = await startProcess({
      command: "python -c \"print('Hello from Python')\"",
      timeout_ms: 5000,
    });
    const interactiveResult = await startProcess({
      command: "python -i",
      timeout_ms: 5000,
    });

    // Extract PID from the result text
    const pidMatch = interactiveResult.content[0].text.match(/Process started with PID (\d+)/);
    const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;

    if (!pid) {
      console.error("Failed to get PID from Python process");
      return;
    }
    const _initialOutput = await readProcessOutput({ pid });
    const _inputResult = await interactWithProcess({
      pid,
      input: 'print("Hello from interactive Python")\n',
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const _output = await readProcessOutput({ pid });
    const _terminateResult = await forceTerminate({ pid });
  } catch (error) {
    console.error("Error in test:", error);
  }
}

simplePythonTest();
