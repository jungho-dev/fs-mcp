// Test script to verify line counting accuracy in read_file

import assert from "node:assert";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "../../out/features/config/config-store.mjs";
import { handleReadFile } from "../../out/controllers/controllers-filesystem.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = join(__dirname, "..", "fixtures", "output");

// Ensure test dir is allowed
await configManager.setValue("allowedDirectories", [TEST_DIR]);

async function setup() {
  await fs.mkdir(TEST_DIR, { recursive: true });
}

async function createTestFile(name, content) {
  const filePath = join(TEST_DIR, name);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

function extractTotalLines(result) {
  // Result is { content: [{ type: 'text', text: '...' }] }
  const text = result?.content?.[0]?.text ?? "";
  const match = text.match(/\(total: (\d+) lines/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function testLineCount() {
  let _passed = 0;
  let failed = 0;

  // Test 1: 3 lines with trailing newline → should report 3
  {
    const filePath = await createTestFile("output-trailing.txt", "line1\nline2\nline3\n");
    const result = await handleReadFile({ path: filePath, offset: 0, length: 2 });
    const total = extractTotalLines(result);
    try {
      assert.strictEqual(total, 3, `trailing newline: expected 3, got ${total}`);
      _passed++;
    } catch (_e) {
      failed++;
    }
  }

  // Test 2: 3 lines without trailing newline → should report 3
  {
    const filePath = await createTestFile("output-no-trailing.txt", "line1\nline2\nline3");
    const result = await handleReadFile({ path: filePath, offset: 0, length: 2 });
    const total = extractTotalLines(result);
    try {
      assert.strictEqual(total, 3, `no trailing newline: expected 3, got ${total}`);
      _passed++;
    } catch (_e) {
      failed++;
    }
  }

  // Test 3: 1 line with trailing newline → should report 1
  {
    const filePath = await createTestFile("output-single-trailing.txt", "hello\n");
    const result = await handleReadFile({ path: filePath, offset: 0, length: 1000 });
    const total = extractTotalLines(result);
    try {
      assert.strictEqual(total, 1, `single + trailing: expected 1, got ${total}`);
      _passed++;
    } catch (_e) {
      failed++;
    }
  }

  // Test 4: 1 line without trailing newline → should report 1
  {
    const filePath = await createTestFile("output-single-no-trailing.txt", "hello");
    const result = await handleReadFile({ path: filePath, offset: 0, length: 1000 });
    const total = extractTotalLines(result);
    try {
      assert.strictEqual(total, 1, `single no trailing: expected 1, got ${total}`);
      _passed++;
    } catch (_e) {
      failed++;
    }
  }

  // Test 5: 100 lines with trailing newline, partial read → total: 100
  {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
    const filePath = await createTestFile("output-hundred.txt", `${lines.join("\n")}\n`);
    const result = await handleReadFile({ path: filePath, offset: 10, length: 5 });
    const total = extractTotalLines(result);
    try {
      assert.strictEqual(total, 100, `100-line partial: expected 100, got ${total}`);
      _passed++;
    } catch (_e) {
      failed++;
    }
  }

  // Test 6: 100 lines without trailing newline → total: 100
  {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
    const filePath = await createTestFile("output-hundred-no-trail.txt", lines.join("\n"));
    const result = await handleReadFile({ path: filePath, offset: 0, length: 5 });
    const total = extractTotalLines(result);
    try {
      assert.strictEqual(total, 100, `100-line no trailing: expected 100, got ${total}`);
      _passed++;
    } catch (_e) {
      failed++;
    }
  }
  if (failed > 0) {
    process.exit(1);
  }
}

setup()
  .then(testLineCount)
  .catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  });
