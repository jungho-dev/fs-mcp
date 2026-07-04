/**
 * @file src/controllers/controllers-web.ts
 * @description MCP web tools: web-fetch, web-render, web-extract, download-to-file.
 * @author JUNGHO
 * @since 2026-07-04
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { ServerResult } from "@assets/type/common";
import { createBatchToolResponse as crtBtchTlRes, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { createErrorResponse as crtErrRes } from "@cores/responses/responses-error";
import { validatePath as vldtPth, validateTargetPath as vldtTrgPth } from "@features/filesystem/filesystem-service";
import { parseWebDump as prsWbDmp, renderHtml as rndrHtml, type WebDumpMode } from "@features/web/web-extract";
import { allowPrivateUrls as alwPrvUrls, DWNL_DFLT_MAX_BYTS, ensureUrlAllowed as ensrUrlAlw, type FetchedPage, httpFetch, type ObscuraOutput, runObscura, WEB_DFLT_TMT_MS, WEB_DFLT_UA, type WebFetchOptions } from "@features/web/web-service";
import { DwFlArSc, WbExArSc, WbFtArSc, WbRnArSc } from "@schemas/schemas-web";

type ParsedWebFetchItem = {
  url: string;
  dump?: string;
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
};
type WebFetchDefaults = {
  dump: string;
  maxBytes: number;
  maxRedirects: number;
  timeoutMs: number;
  userAgent?: string;
};
type ParsedWebExtractItem = {
  html?: string;
  path?: string;
  dump: string;
  baseUrl?: string;
};
type ParsedDownloadItem = {
  url: string;
  path: string;
  maxBytes?: number;
  timeoutMs?: number;
  overwrite: boolean;
};
type DownloadDefaults = {
  maxBytes?: number;
  maxRedirects: number;
  timeoutMs?: number;
  userAgent?: string;
};

// 1. Render fetched page ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Non-HTML bodies (JSON, plain text) cannot be extracted, so they pass through as raw text.
function renderFetchedPage(page: FetchedPage, mode: WebDumpMode): string {
  const body = page.body.toString("utf8");

  if (mode === "html" || !page.contentType.toLowerCase().includes("html")) {
    return body;
  }
  return rndrHtml(mode, body, page.finalUrl);
}

// 2. Fetch one url ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function fetchOneUrl(item: ParsedWebFetchItem, defaults: WebFetchDefaults): Promise<ServerResult> {
  const dump = item.dump ?? defaults.dump;
  const mode = prsWbDmp(dump);
  const opts: WebFetchOptions = {
    maxBytes: item.maxBytes ?? defaults.maxBytes,
    maxRedirects: defaults.maxRedirects,
    timeoutMs: item.timeoutMs ?? defaults.timeoutMs,
    userAgent: item.userAgent ?? defaults.userAgent ?? WEB_DFLT_UA,
  };
  const page = await httpFetch(item.url, opts, alwPrvUrls());
  const rendered = renderFetchedPage(page, mode);

  return {
    content: [{ type: "text", text: `${page.finalUrl}:\n${rendered}` }],
    structuredContent: {
      bytes: page.body.length,
      contentType: page.contentType,
      dump,
      finalUrl: page.finalUrl,
      status: page.status,
      url: item.url,
    },
  };
}

// 3. Handle web fetch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWebFetch(args: unknown): Promise<ServerResult> {
  const parsed = WbFtArSc.parse(args);
  const items: ParsedWebFetchItem[] = [
    ...(parsed.url !== undefined && parsed.url.length > 0 ? [{ url: parsed.url }] : []),
    ...(parsed.items ?? []),
  ];

  if (items.length === 0) {
    return crtErrRes("url or items is required");
  }
  const defaults: WebFetchDefaults = {
    dump: parsed.dump,
    maxBytes: parsed.maxBytes,
    maxRedirects: parsed.maxRedirects,
    timeoutMs: parsed.timeoutMs,
    userAgent: parsed.userAgent,
  };
  const results = await rnPrllBtch(items, (item) => fetchOneUrl(item, defaults));

  return crtBtchTlRes("web-fetch", results, { resultMode: "full" });
}

// 4. Handle web render ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWebRender(args: unknown): Promise<ServerResult> {
  const parsed = WbRnArSc.parse(args);

  // evalScript runs arbitrary JS in the browser and can reach internal hosts, bypassing the IP
  // guard, so it is gated behind the same private-access opt-in as the SSRF boundary.
  if (parsed.evalScript !== undefined && parsed.evalScript.length > 0 && !alwPrvUrls()) {
    return crtErrRes("web-render evalScript can reach internal networks and bypass the SSRF guard; set FS_MCP_ALLOW_PRIVATE_URLS=1 to enable it");
  }
  try {
    await ensrUrlAlw(parsed.url, alwPrvUrls());
  }
  catch (error) {
    return crtErrRes(error instanceof Error ? error.message : String(error));
  }
  const cmd = ["fetch", "--dump", parsed.dump];

  if (parsed.selector !== undefined && parsed.selector.length > 0) {
    cmd.push("--selector", parsed.selector);
  }
  cmd.push("--wait", String(parsed.wait), "--timeout", String(parsed.timeout));
  if (parsed.waitUntil !== undefined && parsed.waitUntil.length > 0) {
    cmd.push("--wait-until", parsed.waitUntil);
  }
  if (parsed.userAgent !== undefined && parsed.userAgent.length > 0) {
    cmd.push("--user-agent", parsed.userAgent);
  }
  if (parsed.stealth) {
    cmd.push("--stealth");
  }
  if (parsed.evalScript !== undefined && parsed.evalScript.length > 0) {
    cmd.push("--eval", parsed.evalScript);
  }
  if (parsed.quiet) {
    cmd.push("--quiet");
  }
  cmd.push(parsed.url);

  // obscura's own --timeout is in seconds; give the process a wider wall-clock ceiling.
  const wallMs = (parsed.timeout + 15) * 1000;
  let output: ObscuraOutput;

  try {
    output = await runObscura(cmd, wallMs);
  }
  catch (error) {
    return crtErrRes(error instanceof Error ? error.message : String(error));
  }
  if (output.statusCode !== 0) {
    return crtErrRes(`obscura fetch failed (code ${output.statusCode}): ${output.stderr.trim()}`);
  }
  return {
    content: [{ type: "text", text: `${parsed.url}:\n${output.stdout.trimEnd()}` }],
    structuredContent: {
      backend: output.backend,
      dump: parsed.dump,
      exitCode: output.statusCode,
      url: parsed.url,
    },
  };
}

// 5. Extract one item ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function extractOneItem(item: ParsedWebExtractItem): Promise<ServerResult> {
  const mode = prsWbDmp(item.dump);
  let label: string;
  let html: string;

  if (item.html !== undefined && item.html.length > 0) {
    label = "inline";
    html = item.html;
  }
  else if (item.path !== undefined && item.path.length > 0) {
    const resolved = await vldtPth(item.path);
    try {
      html = await fs.readFile(resolved, "utf8");
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return crtErrRes(`Failed to read ${resolved}: ${message}`);
    }
    label = resolved;
  }
  else {
    return crtErrRes("html or path is required");
  }
  const rendered = rndrHtml(mode, html, item.baseUrl);

  return {
    content: [{ type: "text", text: `${label}:\n${rendered}` }],
    structuredContent: { chars: rendered.length, dump: item.dump },
  };
}

// 6. Handle web extract ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleWebExtract(args: unknown): Promise<ServerResult> {
  const parsed = WbExArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => extractOneItem(item));

  return crtBtchTlRes("web-extract", results, { resultMode: "full" });
}

// 7. Download one item ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function downloadOneItem(item: ParsedDownloadItem, defaults: DownloadDefaults): Promise<ServerResult> {
  const target = await vldtTrgPth(item.path);
  let exists = true;

  try {
    await fs.lstat(target);
  }
  catch {
    exists = false;
  }
  if (exists && !item.overwrite) {
    return crtErrRes(`File already exists (set overwrite:true): ${target}`);
  }
  const opts: WebFetchOptions = {
    maxBytes: item.maxBytes ?? defaults.maxBytes ?? DWNL_DFLT_MAX_BYTS,
    maxRedirects: defaults.maxRedirects,
    timeoutMs: item.timeoutMs ?? defaults.timeoutMs ?? WEB_DFLT_TMT_MS,
    userAgent: defaults.userAgent ?? WEB_DFLT_UA,
  };
  const page = await httpFetch(item.url, opts, alwPrvUrls());

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, page.body);
  return {
    content: [{ type: "text", text: `Downloaded ${page.body.length} bytes from ${page.finalUrl} to ${target}` }],
    structuredContent: {
      bytes: page.body.length,
      contentType: page.contentType,
      finalUrl: page.finalUrl,
      path: target,
      status: page.status,
      url: item.url,
    },
  };
}

// 8. Handle download to file ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleDownloadToFile(args: unknown): Promise<ServerResult> {
  const parsed = DwFlArSc.parse(args);
  const defaults: DownloadDefaults = {
    maxBytes: parsed.maxBytes,
    maxRedirects: parsed.maxRedirects,
    timeoutMs: parsed.timeoutMs,
    userAgent: parsed.userAgent,
  };
  const results = await rnPrllBtch(parsed.items, (item) => downloadOneItem(item, defaults));

  return crtBtchTlRes("download-to-file", results, { resultMode: "full" });
}
