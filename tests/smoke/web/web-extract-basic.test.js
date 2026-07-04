/**
 * @file tests/smoke/web/web-extract-basic.test.js
 * @description Web tool smoke tests (offline: extract conversion plus web guard rejections).
 * @author JUNGHO
 * @since 2026-07-04
 */

import assert from "node:assert/strict";
import { dispatchToolCall as dsptTlCll } from "../../../out/tools/tools-dispatcher.js";

// 1. batch body text ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// The batch text echoes the request input, so extraction checks slice from the item label
// ("inline:") to inspect only the rendered body.
function batchBodyText(result) {
  assert.equal(typeof result.structuredContent, "object");
  const text = result.structuredContent.data.content[0].text;
  const labelIndex = text.indexOf("inline:");
  return labelIndex >= 0 ? text.slice(labelIndex) : text;
}

// 2. web-extract markdown ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWebExtractMarkdown() {
  const result = await dsptTlCll("web-extract", {
    items: [{ html: "<h1>Hi</h1><p>Body with <strong>bold</strong> and <a href=\"https://e.com/x\">link</a></p>", dump: "markdown" }],
  });

  assert.notEqual(result.isError, true);
  const text = batchBodyText(result);
  assert.equal(text.includes("# Hi"), true);
  assert.equal(text.includes("**bold**"), true);
  assert.equal(text.includes("[link](https://e.com/x)"), true);
}

// 3. web-extract links ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWebExtractLinks() {
  const html = "<a href=\"/x\">1</a><a href=\"/x\">dup</a><a href=\"#f\">frag</a><a href=\"https://e.com/y\">2</a>";
  const result = await dsptTlCll("web-extract", {
    items: [{ html, dump: "links", baseUrl: "https://ex.com/base" }],
  });

  assert.notEqual(result.isError, true);
  const text = batchBodyText(result);
  assert.equal(text.includes("https://ex.com/x"), true);
  assert.equal(text.includes("https://e.com/y"), true);
  assert.equal(text.includes("ex.com/base#f"), false);
  assert.equal((text.match(/ex\.com\/x/g) ?? []).length, 1);
}

// 4. web-extract text ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWebExtractText() {
  const result = await dsptTlCll("web-extract", {
    items: [{ html: "<script>skip()</script><p>Alpha &amp; beta</p>", dump: "text" }],
  });

  assert.notEqual(result.isError, true);
  const text = batchBodyText(result);
  assert.equal(text.includes("Alpha & beta"), true);
  assert.equal(text.includes("skip()"), false);
}

// 5. web-extract requires html or path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWebExtractRequiresInput() {
  const result = await dsptTlCll("web-extract", { items: [{ dump: "text" }] });

  assert.equal(result.isError, true);
}

// 6. web-fetch blocks loopback ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWebFetchBlocksLoopback() {
  const previous = process.env.FS_MCP_ALLOW_PRIVATE_URLS;
  delete process.env.FS_MCP_ALLOW_PRIVATE_URLS;

  try {
    const result = await dsptTlCll("web-fetch", { url: "http://127.0.0.1/" });
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result.structuredContent).includes("Blocked non-public address"), true);
  }
  finally {
    if (previous !== undefined) {
      process.env.FS_MCP_ALLOW_PRIVATE_URLS = previous;
    }
  }
}

// 7. web-render rejects eval without allow-private ―――――――――――――――――――――――――――――――――――――――――――――――――――
async function testWebRenderRejectsEval() {
  const previous = process.env.FS_MCP_ALLOW_PRIVATE_URLS;
  delete process.env.FS_MCP_ALLOW_PRIVATE_URLS;

  try {
    const result = await dsptTlCll("web-render", { url: "http://example.invalid/", evalScript: "return 1" });
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result.structuredContent).includes("evalScript"), true);
  }
  finally {
    if (previous !== undefined) {
      process.env.FS_MCP_ALLOW_PRIVATE_URLS = previous;
    }
  }
}

// 8. download-to-file requires url and path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function testDownloadRequiresUrlAndPath() {
  const result = await dsptTlCll("download-to-file", { items: [{ url: "https://example.com/" }] });

  assert.equal(result.isError, true);
}

// 9. test runner ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function main() {
  await testWebExtractMarkdown();
  await testWebExtractLinks();
  await testWebExtractText();
  await testWebExtractRequiresInput();
  await testWebFetchBlocksLoopback();
  await testWebRenderRejectsEval();
  await testDownloadRequiresUrlAndPath();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
