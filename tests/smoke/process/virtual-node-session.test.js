import assert from "node:assert/strict";
import { forceTerminate as frcTrmn, interactWithProcess as intrWthProc, listSessions, startProcess } from "../../../out/features/process/process-runner.js";

// 1. Extract pid ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function extractPid(result) {
  const pidPattern = /PID (-?\d+)/;
  const match = result.content[0].text.match(pidPattern);
  return match ? Number.parseInt(match[1], 10) : null;
}

// 2. Test virtual node session lifecycle ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testVirtualNodeSessionLifecycle() {
  let pid = null;

  try {
    const startResult = await startProcess({
      command: "node:local",
      timeout_ms: 4321,
    });

    assert(!startResult.isError, "node:local start should succeed");
    assert(startResult.content[0].text.includes("FRESH script"), "Start message should explain stateless execution");

    pid = extractPid(startResult);
    assert(pid !== null, "Should extract virtual PID");
    assert(pid < 0, "Virtual session should use a negative PID");

    const listBefore = await listSessions();
    assert(!listBefore.isError, "Listing sessions should succeed");
    assert(listBefore.content[0].text.includes(`PID: ${pid} (node:local)`), "Virtual session should appear in list_sessions");
    assert(listBefore.content[0].text.includes("Timeout: 4321ms"), "Configured virtual timeout should appear in list_sessions");

    const runResult = await intrWthProc({
      pid,
      input: 'console.log("virtual-node-ok")',
      timeout_ms: 5000,
    });

    assert(!runResult.isError, "Executing code in virtual session should succeed");
    assert(runResult.content[0].text.includes("virtual-node-ok"), "Virtual session should return script output");

    const trmnRes = await frcTrmn({ pid });
    assert(!trmnRes.isError, "Virtual session termination should succeed");
    assert.equal(trmnRes.content[0].text, `Cleared virtual Node.js session ${pid}`);

    pid = null;

    const listAfter = await listSessions();
    assert(!listAfter.isError, "Listing sessions after terminate should succeed");
    assert(!listAfter.content[0].text.includes("(node:local)"), "Cleared virtual session should no longer be listed");
  }
  finally {
    if (pid !== null) {
      await frcTrmn({ pid }).catch(() => undefined);
    }
  }
}

// 3. Run all tests ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runAllTests() {
  try {
    await testVirtualNodeSessionLifecycle();
    return true;
  }
  catch (error) {
    console.error("\nTest failed:", error.message);
    console.error(error.stack);
    return false;
  }
}

runAllTests()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error("Test error:", error);
    process.exit(1);
  });
