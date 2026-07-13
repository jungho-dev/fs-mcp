/**
 * @file src/features/web/web-service.ts
 * @description Web HTTP tier: SSRF guard, manual-redirect fetch, and obscura runner.
 * @author JUNGHO
 * @since 2026-07-04
 */

import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import { PCKG_VRSN } from "@features/config/config-store";

export declare interface WebFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
}

export declare interface FetchedPage {
  status: number;
  contentType: string;
  body: Buffer;
  finalUrl: string;
}

export declare interface ObscuraOutput {
  statusCode: number | null;
  stdout: string;
  stderr: string;
  backend: string;
}

export const WEB_DFLT_TMT_MS = 20_000;
export const WEB_DFLT_MAX_BYTS = 5_000_000;
export const WEB_DFLT_MAX_RDRS = 5;
export const DWNL_DFLT_MAX_BYTS = 50_000_000;
export const WEB_DFLT_UA = `fs-mcp/${PCKG_VRSN}`;
const WEB_MAX_ALLW_BYTS = 200_000_000;
const OBSC_DFLT_BIN = "C:/JUNGHO/0.Tools/obscura.exe";

// 1. Allow private urls --------------------------------------------------------------------------
// Private and non-public addresses are always blocked.
export function allowPrivateUrls(): boolean {
  return false;
}

// 2. Parse web url --------------------------------------------------------------------------------
function parseWebUrl(url: string): { host: string; scheme: string } {
  let parsed: URL;

  try {
    parsed = new URL(url.trim());
  }
  catch {
    throw new Error("URL must include an http:// or https:// scheme");
  }
  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    throw new Error("Only http:// and https:// URL schemes are accepted");
  }
  if (parsed.hostname.length === 0) {
    throw new Error("URL host is required");
  }
  return { host: parsed.hostname, scheme };
}

// 3. Is public ipv4 -------------------------------------------------------------------------------
function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  const [a, b, c] = octets;

  if (a === 0 || a === 10 || a === 127) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if ((a === 192 && b === 168) || (a === 169 && b === 254)) {
    return false;
  }
  if (a === 100 && (b & 0xc0) === 0x40) {
    return false;
  }
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) {
    return false;
  }
  return a < 224;
}

// 4. Parse ipv6 segments --------------------------------------------------------------------------
function parseIpv6Segments(address: string): number[] | null {
  const [bare] = address.split("%");
  const tail: number[] = [];
  let body = bare;
  const v4Match = body.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);

  if (v4Match) {
    const parts = v4Match[1].split(".").map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => part > 255)) {
      return null;
    }
    tail.push((parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]);
    body = body.slice(0, body.length - v4Match[1].length);
    if (!body.endsWith("::")) {
      body = body.slice(0, -1);
    }
  }
  const halves = body.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parseGroups = (text: string): number[] | null => {
    if (text.length === 0) {
      return [];
    }
    const words: number[] = [];
    for (const group of text.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
        return null;
      }
      words.push(Number.parseInt(group, 16));
    }
    return words;
  };
  const head = parseGroups(halves[0]);
  const rest = halves.length === 2 ? parseGroups(halves[1]) : [];

  if (head === null || rest === null) {
    return null;
  }
  const known = head.length + rest.length + tail.length;
  if (halves.length === 2) {
    return known > 8 ? null : [...head, ...new Array(8 - known).fill(0), ...rest, ...tail];
  }
  return known === 8 ? [...head, ...rest, ...tail] : null;
}

// 5. Embedded ipv4 --------------------------------------------------------------------------------
// Canonicalize IPv4-in-IPv6 embeddings (mapped, compatible, NAT64, 6to4) so loopback/private
// targets cannot pass the guard through an IPv6 literal.
function embeddedIpv4(segments: number[]): string | null {
  const lowPrefix = segments.slice(0, 5).every((word) => word === 0) && (segments[5] === 0 || segments[5] === 0xffff);
  const nat64 = segments[0] === 0x0064 && segments[1] === 0xff9b && segments.slice(2, 6).every((word) => word === 0);

  if (lowPrefix || nat64) {
    return `${segments[6] >> 8}.${segments[6] & 0xff}.${segments[7] >> 8}.${segments[7] & 0xff}`;
  }
  if (segments[0] === 0x2002) {
    return `${segments[1] >> 8}.${segments[1] & 0xff}.${segments[2] >> 8}.${segments[2] & 0xff}`;
  }
  return null;
}

// 6. Is public ip ---------------------------------------------------------------------------------
export function isPublicIp(address: string): boolean {
  if (net.isIPv4(address)) {
    return isPublicIpv4(address);
  }
  const segments = parseIpv6Segments(address);
  if (segments === null) {
    return false;
  }
  const isUnspec = segments.every((word) => word === 0);
  const isLoopback = segments.slice(0, 7).every((word) => word === 0) && segments[7] === 1;
  const isMulticast = (segments[0] & 0xff00) === 0xff00;

  if (isUnspec || isLoopback || isMulticast) {
    return false;
  }
  const embedded = embeddedIpv4(segments);
  if (embedded !== null) {
    return isPublicIpv4(embedded);
  }
  const isUniqueLocal = (segments[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (segments[0] & 0xffc0) === 0xfe80;

  return !(isUniqueLocal || isLinkLocal);
}

// 7. Ensure url allowed ---------------------------------------------------------------------------
export async function ensureUrlAllowed(url: string, allowPrivate: boolean): Promise<void> {
  const parts = parseWebUrl(url);

  if (allowPrivate) {
    return;
  }
  const host = parts.host.startsWith("[") && parts.host.endsWith("]") ? parts.host.slice(1, -1) : parts.host;
  if (net.isIP(host) !== 0) {
    if (!isPublicIp(host)) {
      throw new Error(`Blocked non-public address ${host} for host ${host} (private and non-public addresses are not allowed)`);
    }
    return;
  }
  let resolved: { address: string }[];
  try {
    resolved = await dns.lookup(host, { all: true });
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resolve host ${host}: ${message}`);
  }
  if (resolved.length === 0) {
    throw new Error(`Host ${host} did not resolve to any address`);
  }
  for (const entry of resolved) {
    if (!isPublicIp(entry.address)) {
      throw new Error(`Blocked non-public address ${entry.address} for host ${host} (private and non-public addresses are not allowed)`);
    }
  }
}

// 8. Resolve url ----------------------------------------------------------------------------------
// Resolve a possibly-relative target (redirect Location or <a href>) against a base URL.
export function resolveUrl(base: string, target: string): string {
  const trimmed = target.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  try {
    return new URL(trimmed, base).toString();
  }
  catch {
    return trimmed;
  }
}

// 9. Read body limited ----------------------------------------------------------------------------
async function readBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (response.body === null) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: Stream chunks must be read sequentially.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`body exceeded the ${maxBytes} byte limit`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// 10. Http fetch ----------------------------------------------------------------------------------
// Follows redirects manually and re-checks each hop against the SSRF boundary, which closes the
// redirect-to-internal-host vector. One wall-clock budget spans the whole redirect chain.
export async function httpFetch(url: string, opts: WebFetchOptions, allowPrivate: boolean): Promise<FetchedPage> {
  let current = url.trim();
  let redirects = 0;
  const deadline = Date.now() + opts.timeoutMs;

  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: Each redirect hop must be validated before following.
    await ensureUrlAllowed(current, allowPrivate);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Fetch exceeded total timeout of ${opts.timeoutMs}ms`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let response: Response;

    try {
      response = await fetch(current, {
        headers: { "User-Agent": opts.userAgent },
        redirect: "manual",
        signal: controller.signal,
      });
    }
    catch (error) {
      clearTimeout(timer);
      const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : "";
      const message = error instanceof Error ? `${error.message}${cause}` : String(error);
      throw new Error(`HTTP request to ${current} failed: ${message}`);
    }
    try {
      const status = response.status;
      if (status >= 300 && status < 400 && status !== 304) {
        const location = response.headers.get("location");
        if (location !== null) {
          await response.body?.cancel().catch(() => undefined);
          if (redirects >= opts.maxRedirects) {
            throw new Error(`Too many HTTP redirects (> ${opts.maxRedirects})`);
          }
          current = resolveUrl(current, location);
          redirects += 1;
          continue;
        }
      }
      const contentType = response.headers.get("content-type") ?? "";
      const maxBytes = Math.min(opts.maxBytes, WEB_MAX_ALLW_BYTS);
      let body: Buffer;

      try {
        body = await readBodyLimited(response, maxBytes);
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read response body (limit ${maxBytes} bytes): ${message}`);
      }
      return { body, contentType, finalUrl: current, status };
    }
    finally {
      clearTimeout(timer);
    }
  }
}

// 11. Resolve obscura bin -------------------------------------------------------------------------
function resolveObscuraBin(): string {
  return existsSync(OBSC_DFLT_BIN) ? OBSC_DFLT_BIN : "obscura";
}

// 12. Run obscura ---------------------------------------------------------------------------------
export function runObscura(args: string[], timeoutMs: number): Promise<ObscuraOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveObscuraBin(), args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error(`path-obscura timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Failed to start path-obscura: ${error.message}. Ensure 'obscura' is installed and on PATH.`));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        backend: "path-obscura",
        statusCode: code,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      });
    });
  });
}
