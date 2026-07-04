import assert from "node:assert/strict";
import { listProcesses as lstPrcs } from "../../../out/features/process/process-service.js";

// 1. Test list processes --------------------------------------------------------------------------
async function testListProcesses() {
  const lnSprtPat = /\r?\n/;
  const result = await lstPrcs();

  assert.notStrictEqual(result.isError, true, "listProcesses should succeed");
  assert.equal(result.content.length, 1, "listProcesses should return a single text block");
  assert.equal(result.content[0].type, "text", "listProcesses should return text output");

  const output = result.content[0].text;
  const lines = output.split(lnSprtPat).filter(Boolean);

  assert(lines.length > 0, "listProcesses should report at least one process");
  assert(!output.includes("PID: NaN"), "listProcesses should not emit invalid PIDs");
  assert(!output.includes("Command: undefined"), "listProcesses should not emit undefined commands");

  if (process.platform === "win32") {
    assert(lines.some((line) => line.includes("CPU: N/A")), "Windows process output should use the N/A CPU placeholder");
  }
}

testListProcesses().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
