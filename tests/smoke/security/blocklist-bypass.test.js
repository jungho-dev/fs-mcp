/**
 * Tests for command blocklist bypass fixes
 * Covers: absolute path bypass (#218), command substitution bypass (#217)
 */

import assert from "node:assert";
import { commandManager } from "../../../out/features/process/process-command-policy.js";

async function runTests() {
  // mock config with blocked commands
  const _blockedCmds = ["sudo", "iptables", "rm"];

  try {
    // Test 1: absolute path should be normalized
    const cmds1 = commandManager.extractCommands("/usr/bin/sudo ls");
    assert.ok(cmds1.includes("sudo"), 'FAIL: should extract "sudo" from absolute path');

    // Test 2: $() command substitution inside quotes
    const cmds2 = commandManager.extractCommands('echo "$(iptables -L)"');
    assert.ok(cmds2.includes("iptables"), 'FAIL: should extract "iptables" from $() inside quotes');

    // Test 3: backtick substitution
    const cmds3 = commandManager.extractCommands("echo `rm -rf /`");
    assert.ok(cmds3.includes("rm"), 'FAIL: should extract "rm" from backticks');

    // Test 4: normal command still works
    const cmds4 = commandManager.extractCommands("ls -la /home");
    assert.ok(cmds4.includes("ls"), 'FAIL: should extract "ls" normally');

    // Test 5: nested $() inside $()
    const cmds5 = commandManager.extractCommands("echo $(cat $(which sudo))");
    assert.ok(cmds5.includes("cat"), 'FAIL: should extract "cat" from nested $()');

    // Test 6: path with env var prefix
    const cmds6 = commandManager.extractCommands("HOME=/tmp /usr/sbin/iptables");
    assert.ok(cmds6.includes("iptables"), 'FAIL: should extract "iptables" from path with env');

    // Test 7: backtick substitution inside quotes
    const cmds7 = commandManager.extractCommands('echo "`/usr/bin/sudo`"');
    assert.ok(cmds7.includes("sudo"), 'FAIL: should extract "sudo" from backticks inside quotes');

    // Test 8: dollar-prefixed tokens should be ignored
    const cmds8 = commandManager.extractCommands("$MYVAR ls");
    assert.ok(cmds8.includes("ls"), 'FAIL: should extract "ls" and ignore $MYVAR');
    assert.ok(!cmds8.includes("$MYVAR"), "FAIL: should not include $MYVAR as a command");
  } catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("Test execution failed:", error);
  process.exit(1);
});
