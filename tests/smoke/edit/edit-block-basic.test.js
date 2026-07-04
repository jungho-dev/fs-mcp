import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { handleEditBlock as hndlEdtBlck } from "../../../out/controllers/controllers-edit.js";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);

const TST_FLPT = path.join(__dirname, "test.txt");

// 1. Setup ----------------------------------------------------------------------------------------
async function setup() {
  // Save original config to restore later
  const origCfg = await cfgMgr.getConfig();
  return origCfg;
}

// 1. Teardown function to clean up after tests ----------------------------------------------------
async function teardown(origCfg) {
  // Reset configuration to original
  await cfgMgr.updateConfig(origCfg);

  await fs.rm(TST_FLPT, { force: true, recursive: true });
}

// Export the main test function

// 3. Test edit block ------------------------------------------------------------------------------
async function testEditBlock() {
  try {
    await cfgMgr.setValue("allowedDirectories", [__dirname]);

    // Create a test file
    const fs = await import("node:fs/promises");
    await fs.writeFile(TST_FLPT, "This is old content to replace");

    // Test handleEditBlock
    const _result = await hndlEdtBlck({
      file_path: TST_FLPT,
      old_string: "old content",
      new_string: "new content",
      expected_replacements: 1,
    });

    const fileContent = await fs.readFile(TST_FLPT, "utf8");

    if (!fileContent.includes("new content")) {
      throw new Error("Replace test failed!");
    }

    // Cleanup
    await fs.unlink(TST_FLPT);
    return true;
  }
  catch (error) {
    console.error("Test failed:", error);
    return false;
  }
}

// Export the main test function

// 4. Run tests ------------------------------------------------------------------------------------
export default async function runTests() {
  let origCfg;
  try {
    origCfg = await setup();
    await testEditBlock();
  }
  catch (error) {
    console.error("Test failed:", error.message);
    return false;
  }
  finally {
    if (origCfg) {
      await teardown(origCfg);
    }
  }
  return true;
}

// If this file is run directly (not imported), execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
