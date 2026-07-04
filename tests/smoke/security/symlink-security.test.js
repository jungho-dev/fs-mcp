/**
 * Test script for symlink security in validatePath
 *
 * This script tests that symlinks cannot be used to bypass allowedDirectories restrictions.
 * The attack scenario:
 * 1. User configures allowedDirectories to ["/allowed"]
 * 2. Attacker creates symlink: /allowed/evil → /etc/passwd (or other restricted path)
 * 3. validatePath should detect this and block access
 */

import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath as flUrlTPth2 } from "node:url";
import { configManager as cfgMgr } from "../../../out/features/config/config-store.js";
import { validatePath } from "../../../out/features/filesystem/filesystem-service.js";

const __filename = flUrlTPth2(import.meta.url);
const __dirname = path.dirname(__filename);

// Test directories
const ALLOWED_DIR = path.join(__dirname, "test_symlink_allowed");
const RSTR_DR = path.join(__dirname, "test_symlink_restricted");
const SYM_T_RSTR = path.join(ALLOWED_DIR, "link_to_restricted");
const SYM_T_RST_FL = path.join(ALLOWED_DIR, "link_to_secret");

// 1. Clean up test directories --------------------------------------------------------------------
async function cleanup() {
  await fs.rm(ALLOWED_DIR, { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(RSTR_DR, { recursive: true, force: true }).catch(() => undefined);
}

// 2. Setup test environment -----------------------------------------------------------------------
async function setup() {
  await cleanup();

  // Create directories
  await fs.mkdir(ALLOWED_DIR, { recursive: true });
  await fs.mkdir(RSTR_DR, { recursive: true });

  // Create a file in the restricted directory (simulates /etc/passwd or ~/.ssh/id_rsa)
  await fs.writeFile(path.join(RSTR_DR, "secret.txt"), "TOP SECRET DATA");

  // Create a normal file in the allowed directory
  await fs.writeFile(path.join(ALLOWED_DIR, "normal.txt"), "Normal allowed content");

  // Create symlinks pointing to restricted locations
  // Symlink to restricted directory
  await fs.symlink(RSTR_DR, SYM_T_RSTR);
  // Symlink to specific restricted file
  await fs.symlink(path.join(RSTR_DR, "secret.txt"), SYM_T_RST_FL);

  // Save original config
  return await cfgMgr.getConfig();
}

// 3. Test helper: check if path validation succeeds or fails --------------------------------------
async function canAccessPath(testPath) {
  try {
    const result = await validatePath(testPath);
    return { success: true, result };
  }
  catch (error) {
    return { success: false, error: error.message };
  }
}

// 4. Test 1: Normal file access within allowed directory (should succeed) -------------------------
async function testNormalFileAccess() {
  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  const normalFile = path.join(ALLOWED_DIR, "normal.txt");
  const result = await canAccessPath(normalFile);

  assert.strictEqual(result.success, true, "Normal file in allowed directory should be accessible");
}

// 5. Test 2: Direct access to restricted directory (should fail) ----------------------------------
async function testDirectRestrictedAccess() {
  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  const result = await canAccessPath(RSTR_DR);

  assert.strictEqual(result.success, false, "Direct access to restricted directory should fail");
}

// 6. Symlink bypass directory test ----------------------------------------------------------------
// This is the main security test!

// 6. Test symlink directory bypass ----------------------------------------------------------------
async function testSymlinkDirectoryBypass() {
  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  // The symlink path LOOKS like it's in ALLOWED_DIR
  // But it actually points to RESTRICTED_DIR
  const result = await canAccessPath(SYM_T_RSTR);

  assert.strictEqual(result.success, false, "SECURITY: Symlink pointing to restricted directory should be BLOCKED");
}

// 7. Test 4: SYMLINK BYPASS - File symlink pointing outside allowed dirs --------------------------
async function testSymlinkFileBypass() {
  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  const result = await canAccessPath(SYM_T_RST_FL);

  assert.strictEqual(result.success, false, "SECURITY: Symlink pointing to restricted file should be BLOCKED");
}

// 8. Test 5: Access file through directory symlink ------------------------------------------------
// Attempt to access a file via the symlinked directory

// 8. Test access through symlink dir --------------------------------------------------------------
async function testAccessThroughSymlinkDir() {
  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  // Try to access a file through the symlinked directory
  // This path: /allowed/link_to_restricted/secret.txt
  // Would resolve to: /restricted/secret.txt
  const thrgSymPth = path.join(SYM_T_RSTR, "secret.txt");

  const result = await canAccessPath(thrgSymPth);

  // This should fail because even though the path looks like it's in allowed dir,
  // the resolved real path is in the restricted dir
  assert.strictEqual(result.success, false, "SECURITY: Accessing file through symlinked directory should be BLOCKED");
}

// 9. Symlink within allowed location --------------------------------------------------------------
async function testSymlinkWithinAllowed() {
  // Create another allowed subdirectory and symlink within it
  const subdir = path.join(ALLOWED_DIR, "subdir");
  await fs.mkdir(subdir, { recursive: true });
  await fs.writeFile(path.join(subdir, "allowed_secret.txt"), "Allowed secret");

  const intSym = path.join(ALLOWED_DIR, "link_to_subdir");
  await fs.symlink(subdir, intSym).catch(() => undefined);

  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  const result = await canAccessPath(intSym);

  // This SHOULD succeed because the resolved path is still within allowed dirs
  assert.strictEqual(result.success, true, "Symlink pointing within allowed directories should be accessible");
}

// 10. Test 7: Broken symlink (pointing to non-existent target) ------------------------------------
async function testBrokenSymlink() {
  const brknSym = path.join(ALLOWED_DIR, "broken_link");
  await fs.symlink("/nonexistent/path/that/does/not/exist", brknSym).catch(() => undefined);

  await cfgMgr.setValue("allowedDirectories", [ALLOWED_DIR]);

  const _result = await canAccessPath(brknSym);
}

// 11. Main test runner ----------------------------------------------------------------------------
async function runAllTests() {
  let origCfg;
  let _passed = 0;
  let failed = 0;

  try {
    origCfg = await setup();

    // Run tests
    const tests = [testNormalFileAccess, testDirectRestrictedAccess, testSymlinkDirectoryBypass, testSymlinkFileBypass, testAccessThroughSymlinkDir, testSymlinkWithinAllowed, testBrokenSymlink];

    for (const test of tests) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: Security tests share staged filesystem state.
        await test();
        _passed++;
      }
      catch (error) {
        console.error(`\n${test.name} FAILED:`, error.message);
        failed++;
      }
    }
  }
  finally {
    // Restore config
    if (origCfg) {
      await cfgMgr.updateConfig(origCfg);
    }
    await cleanup();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export default runAllTests;
