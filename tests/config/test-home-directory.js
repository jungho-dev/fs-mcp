/**
 * Test script for home directory (~) path handling
 *
 * This script tests the tilde expansion and path validation with:
 * 1. Testing tilde (~) expansion in paths
 * 2. Testing tilde with subdirectory (~/Documents) expansion
 * 3. Testing tilde expansion in the allowedDirectories configuration
 * 4. Testing file operations with tilde notation
 */

import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "../../out/features/config/config-store.mjs";
import { createDirectory, listDirectory, readFile, validatePath, writeFile } from "../../out/features/filesystem/filesystem-service.mjs";

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define test paths
const HOME_DIR = os.homedir();
const HOME_TILDE = "~";
const HOME_DOCS_PATH = path.join(HOME_DIR, "Documents");
const HOME_DOCS_TILDE = "~/Documents";
const TEST_DIR = path.join(HOME_DIR, ".claude-test-tilde");
const TEST_DIR_TILDE = "~/.claude-test-tilde";
const _TEST_FILE = path.join(TEST_DIR, "test-file.txt");
const TEST_FILE_TILDE = "~/.claude-test-tilde/test-file.txt";
const TEST_CONTENT = "This is a test file for tilde expansion";

/**
 * Helper function to clean up test directories
 */
async function cleanupTestDirectories() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    if (error.code !== "ENOENT") {
      console.error("Error during cleanup:", error);
    }
  }
}

/**
 * Setup function to prepare the test environment
 */
async function setup() {
  // Clean up before tests
  await cleanupTestDirectories();

  // Save original config to restore later
  const originalConfig = await configManager.getConfig();

  // Set allowed directories to include the home directory for testing tilde expansion
  await configManager.setValue("allowedDirectories", [HOME_DIR, __dirname]);

  return originalConfig;
}

/**
 * Teardown function to clean up after tests
 */
async function teardown(originalConfig) {
  // Reset configuration to original
  await configManager.updateConfig(originalConfig);

  // Clean up test directories
  await cleanupTestDirectories();
}

/**
 * Test simple tilde expansion
 */
async function testTildeExpansion() {
  try {
    const expandedPath = await validatePath(HOME_TILDE);

    // Check if the expanded path is the home directory
    assert.ok(expandedPath.toLowerCase() === HOME_DIR.toLowerCase() || expandedPath.toLowerCase().startsWith(HOME_DIR.toLowerCase()), "Tilde (~) should expand to the home directory");
    return expandedPath; // Return expandedPath for use in the outer function
  } catch (error) {
    console.error(`Error during tilde expansion: ${error.message || error}`);
    throw error;
  }
}

/**
 * Test tilde with subdirectory expansion
 */
async function testTildeWithSubdirectory() {
  try {
    const expandedPath = await validatePath(HOME_DOCS_TILDE);

    // Check if the expanded path is the home documents directory
    assert.ok(
      expandedPath.toLowerCase() === HOME_DOCS_PATH.toLowerCase() || expandedPath.toLowerCase().startsWith(HOME_DOCS_PATH.toLowerCase()),
      "~/Documents should expand to the home documents directory",
    );
  } catch (error) {
    console.error(`Error during tilde with subdirectory expansion: ${error.message || error}`);
    throw error;
  }
}

/**
 * Test tilde in allowedDirectories config
 */
async function testTildeInAllowedDirectories() {
  try {
    // Set allowedDirectories to tilde
    await configManager.setValue("allowedDirectories", [HOME_TILDE]);

    // Verify config was set correctly
    const config = await configManager.getConfig();
    assert.deepStrictEqual(config.allowedDirectories, [HOME_TILDE], "allowedDirectories should contain tilde");

    // Test access to home directory and subdirectory
    try {
      const _homeDirAccess = await validatePath(HOME_DIR);

      const _homeDocsDirAccess = await validatePath(HOME_DOCS_PATH);
    } catch (error) {
      console.error(`Error accessing paths: ${error.message || error}`);
      throw error;
    } finally {
      // Reset allowedDirectories to original value
      await configManager.setValue("allowedDirectories", []);
    }
  } catch (error) {
    console.error(`Error in tilde allowedDirectories test: ${error.message || error}`);
    throw error;
  }
}

/**
 * Test file operations with tilde
 */
async function testFileOperationsWithTilde() {
  try {
    await createDirectory(TEST_DIR_TILDE);

    // Verify the directory exists
    const dirStats = await fs.stat(TEST_DIR);
    assert.ok(dirStats.isDirectory(), "Test directory should exist and be a directory");
    await writeFile(TEST_FILE_TILDE, TEST_CONTENT);
    const fileResult = await readFile(TEST_FILE_TILDE);
    let content;

    // Handle either string or object response from readFile
    if (typeof fileResult === "string") {
      content = fileResult;
    } else if (fileResult && typeof fileResult === "object") {
      content = fileResult.content;
    } else {
      throw new Error("Unexpected return format from readFile");
    }

    // Verify the content
    assert.ok(content === TEST_CONTENT || content.includes(TEST_CONTENT), "File content should match what was written");
    const entries = await listDirectory(TEST_DIR_TILDE);

    // Verify the entries
    assert.ok(
      entries.some((entry) => entry.includes("test-file.txt")),
      "Directory listing should include test file",
    );
  } catch (error) {
    console.error(`Error during file operations with tilde: ${error.message || error}`);
    throw error;
  }
}

/**
 * Main test function
 */
async function testHomeDirectory() {
  try {
    // Test 1: Basic tilde expansion
    const expandedPath = await testTildeExpansion();

    // Check if the expanded path is the home directory
    assert.ok(expandedPath.toLowerCase() === HOME_DIR.toLowerCase() || expandedPath.toLowerCase().startsWith(HOME_DIR.toLowerCase()), "Tilde (~) should expand to the home directory");

    // Test 2: Tilde with subdirectory expansion
    await testTildeWithSubdirectory();

    // Test 3: Tilde in allowedDirectories config
    await testTildeInAllowedDirectories();

    // Test 4: File operations with tilde
    await testFileOperationsWithTilde();
  } catch (error) {
    console.error(`Main test function error: ${error.message || error}`);
    throw error;
  }
}

// Export the main test function
export default async function runTests() {
  let originalConfig;
  try {
    originalConfig = await setup();
    await testHomeDirectory();
    return true; // Explicitly return true on success
  } catch (error) {
    console.error("Test failed:", error.message || error);
    return false;
  } finally {
    if (originalConfig) {
      await teardown(originalConfig);
    }
  }
}

// If this file is run directly (not imported), execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
