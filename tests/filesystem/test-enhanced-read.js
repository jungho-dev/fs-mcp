// Test script to verify enhanced file reading

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "../../out/features/config/config-store.mjs";
import { readFileInternal } from "../../out/features/filesystem/filesystem-service.mjs";

// Get the test directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_OUTPUT_DIR = join(__dirname, "..", "fixtures", "output");
const TEST_FILE_PATH = join(FIXTURE_OUTPUT_DIR, "file-with-1500-lines.txt");

async function testEnhancedReading() {
  let testsPassed = 0;
  const totalTests = 3;

  await configManager.setValue("allowedDirectories", [FIXTURE_OUTPUT_DIR]);

  try {
    try {
      const result1 = await readFileInternal(TEST_FILE_PATH, 0, 10);

      // Validate the result
      const lines = result1.split("\n").filter((line) => line.length > 0);
      if (lines.length === 10 && lines[0].includes("line 1")) {
        testsPassed++;
      } else {
        throw new Error(`Expected 10 lines starting with line 1, got ${lines.length} lines`);
      }
    } catch (error) {
      console.error("Test 1 FAILED:", error.message);
    }
    try {
      const result2 = await readFileInternal(TEST_FILE_PATH, 500, 5);

      // Validate the result
      const lines = result2.split("\n").filter((line) => line.length > 0);
      if (lines.length === 5 && lines[0].includes("line 501")) {
        testsPassed++;
      } else {
        throw new Error(`Expected 5 lines starting with line 501, got ${lines.length} lines, first line: ${lines[0]}`);
      }
    } catch (error) {
      console.error("Test 2 FAILED:", error.message);
    }
    try {
      const result3 = await readFileInternal(TEST_FILE_PATH, 1490, 10);

      // Validate the result
      const lines = result3.split("\n").filter((line) => line.length > 0);
      if (lines.length === 10 && lines[0].includes("line 1491") && lines[9].includes("line 1500")) {
        testsPassed++;
      } else {
        throw new Error(`Expected 10 lines from 1491 to 1500, got ${lines.length} lines, first line: ${lines[0]}, last line: ${lines.at(-1)}`);
      }
    } catch (error) {
      console.error("Test 3 FAILED:", error.message);
    }

    if (testsPassed === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test suite failed with error:", error);
    process.exit(1);
  }
}

testEnhancedReading().catch(console.error);
