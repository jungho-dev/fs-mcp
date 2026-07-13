/**
 * @file src/features/inspect/inspect-service.ts
 * @description Compact read-only filesystem inspection service for coding workflows.
 * @author JUNGHO
 * @since 2026-06-03
 */

// Bundles count-files / search / json-pick / snippet / git-status modes into one batched call.

import fs from "node:fs/promises";
import path from "node:path";
import type {ServerResult} from "@assets/type/common";
import {createErrorResponse as crtErrRes} from "@cores/responses/responses-error";
import {validatePath} from "@features/filesystem/filesystem-service";
import {executeGitTool as exctGtTl} from "@features/git/git-service";
import {GT_INPT_SCHS} from "@schemas/schemas-git";
import {InspArSc, type InspReqSc} from "@schemas/schemas-inspect";
import type {z} from "zod/v3";

type InspectRequest = z.infer<typeof InspReqSc>;
type InspectStatus = "ok" | "partial" | "error";
type InspectConfidence = "high" | "medium" | "low";

interface InspectState {
  maxChars: number;
  usedChars: number;
  scannedFiles: number;
  bytesRead: number;
  truncated: boolean;
}

interface InspectEvidence {
  path: string;
  lineStart: number | null;
  lineEnd: number | null;
  snippet: string;
}

interface InspectAnswer {
  id: string;
  op: string;
  status: InspectStatus;
  value: unknown;
  confidence: InspectConfidence;
  evidence: InspectEvidence[];
  warnings: string[];
}

interface SearchHit {
  rel: string;
  line: number;
  text: string;
  fields: Record<string, string>;
}

interface ExtractSpec {
  name: string;
  regex: RegExp;
}

interface SearchCtx {
  root: string;
  recursive: boolean;
  filePattern: string | undefined;
  matcher: RegExp;
  extracts: ExtractSpec[];
  maxMatches: number;
}

// Compiled wildcard patterns are reused across entries; mirrors the search glob cache pattern.
const INSP_WLDC_CACHE = new Map<string, RegExp>();
const RGX_ESC_PAT = /[.+()[\]{}|^$\\*?]/g;
// biome-ignore lint/security/noSecrets: Regex metacharacter list, not a credential.
const RGX_SPCL_CHRS = ".+()[]{}|^$\\*?";
const LN_SPLT_PAT = /\r\n|\r|\n/;

// 1. Answer builders ------------------------------------------------------------------------------
function answerOf(id: string, op: string, status: InspectStatus, value: unknown, confidence: InspectConfidence, evidence: InspectEvidence[], warnings: string[]): InspectAnswer {
  return {id, op, status, value, confidence, evidence, warnings};
}

function answerError(id: string, op: string, message: string): InspectAnswer {
  return answerOf(id, op, "error", null, "low", [], [message]);
}

// 2. Path helpers ---------------------------------------------------------------------------------
function cmpPath(value: string): string {
  let out = value.replace(/\\/g, "/");
  if (out.startsWith("//?/")) {
    out = out.slice(4);
  }
  if (process.platform === "win32") {
    out = out.toLowerCase();
  }
  return out.replace(/\/+$/, "");
}

function withinRoot(root: string, target: string): boolean {
  const rootCmp = cmpPath(root);
  const targetCmp = cmpPath(target);

  return targetCmp === rootCmp || targetCmp.startsWith(`${rootCmp}/`);
}

function relPath(root: string, target: string): string {
  const rel = path.relative(root, target);
  if (rel === "" || rel.startsWith("..")) {
    return target.replace(/\\/g, "/");
  }
  return rel.replace(/\\/g, "/");
}

async function inspectRoot(rootText: string): Promise<string> {
  const allowed = await validatePath(rootText);
  const stat = await fs.stat(allowed);

  if (!stat.isDirectory()) {
    throw new Error(`root is not a directory: ${allowed}`);
  }
  return await fs.realpath(allowed);
}

async function requestPath(root: string, reqPath: string | undefined): Promise<string> {
  if (typeof reqPath !== "string") {
    throw new Error("path must be a string");
  }
  const joined = path.isAbsolute(reqPath) ? reqPath : path.join(root, reqPath);
  const allowed = await validatePath(joined);

  try {
    await fs.stat(allowed);
  }
  catch {
    throw new Error(`Path does not exist: ${allowed}`);
  }
  const real = await fs.realpath(allowed);
  if (!withinRoot(root, real)) {
    throw new Error(`Path is outside root: ${real}`);
  }
  return real;
}

// 3. Wildcard matching ----------------------------------------------------------------------------
function wildcardMatch(pattern: string, text: string): boolean {
  let regex = INSP_WLDC_CACHE.get(pattern);

  if (regex === undefined) {
    let source = "^";
    for (const ch of pattern) {
      if (ch === "*") {
        source += ".*";
      }
      else if (ch === "?") {
        source += ".";
      }
      else if (RGX_SPCL_CHRS.includes(ch)) {
        source += `\\${ch}`;
      }
      else {
        source += ch;
      }
    }
    source += "$";
    try {
      regex = new RegExp(source);
    }
    catch {
      return false;
    }
    INSP_WLDC_CACHE.set(pattern, regex);
  }
  return regex.test(text);
}

// 4. Evidence shaping -----------------------------------------------------------------------------
// Per-call snippet budget: appends evidence until maxChars is consumed, then flags truncation.
function addEvidence(evidence: InspectEvidence[], entryPath: string, lineStart: number | null, lineEnd: number | null, snippet: string, state: InspectState): void {
  if (state.usedChars >= state.maxChars) {
    state.truncated = true;
    return;
  }
  const remaining = state.maxChars - state.usedChars;
  let nextSnippet = snippet;

  if (nextSnippet.length > remaining) {
    state.truncated = true;
    nextSnippet = nextSnippet.slice(0, remaining);
  }
  state.usedChars += nextSnippet.length;
  evidence.push({
    path: entryPath,
    lineStart,
    lineEnd,
    snippet: nextSnippet,
  });
}

// 5. Directory traversal --------------------------------------------------------------------------
async function readDirSorted(dirPath: string): Promise<Array<{name: string; full: string; isDirectory: boolean; isFile: boolean}>> {
  const entries = await fs.readdir(dirPath, {withFileTypes: true});
  const mapped = entries.map((entry) => ({
    name: entry.name,
    full: path.join(dirPath, entry.name),
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  }));

  mapped.sort((left, right) => (left.full < right.full ? -1 : left.full > right.full ? 1 : 0));
  return mapped;
}

async function countDir(root: string, dirPath: string, glob: string, recursive: boolean, samples: string[], state: InspectState): Promise<number> {
  let count = 0;

  for (const entry of await readDirSorted(dirPath)) {
    if (entry.isDirectory) {
      if (recursive) {
        // biome-ignore lint/performance/noAwaitInLoops: Recursion shares one sample budget and must stay ordered.
        count += await countDir(root, entry.full, glob, recursive, samples, state);
      }
      continue;
    }
    if (!entry.isFile) {
      continue;
    }
    state.scannedFiles += 1;
    if (!wildcardMatch(glob, entry.name)) {
      continue;
    }
    count += 1;
    if (samples.length < 20) {
      samples.push(relPath(root, entry.full));
    }
  }
  return count;
}

// 6. Count files ----------------------------------------------------------------------------------
async function countFilesAnswer(root: string, request: InspectRequest, id: string, state: InspectState): Promise<InspectAnswer> {
  const op = "count-files";
  let target: string;

  try {
    target = await requestPath(root, request.path);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) {
    return answerError(id, op, `Path is not a directory: ${target}`);
  }
  const glob = request.glob ?? request.pattern ?? "*";
  const recursive = request.recursive ?? false;
  const samples: string[] = [];
  let count: number;

  try {
    count = await countDir(root, target, glob, recursive, samples, state);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
  const evidence: InspectEvidence[] = [];
  const sampleText = samples.length === 0 ? "no matched files" : `sample: ${samples.join(", ")}`;

  addEvidence(evidence, relPath(root, target), null, null, sampleText, state);
  return answerOf(id, op, "ok", {
    path: relPath(root, target),
    glob,
    recursive,
    count,
  }, "high", evidence, []);
}

// 7. Search ---------------------------------------------------------------------------------------
function escapeRegexLiteral(value: string): string {
  return value.replace(RGX_ESC_PAT, "\\$&");
}

function buildSearchRegex(pattern: string, literal: boolean): RegExp {
  const source = literal ? escapeRegexLiteral(pattern) : pattern;
  return new RegExp(source);
}

function buildExtractSpecs(request: InspectRequest): ExtractSpec[] {
  const items = request.extract ?? [];
  return items.map((item) => ({
    name: item.name,
    regex: new RegExp(item.regex),
  }));
}

function captureFields(line: string, specs: ExtractSpec[]): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const spec of specs) {
    const captures = spec.regex.exec(line);
    if (captures && captures[1] !== undefined) {
      fields[spec.name] = captures[1];
    }
  }
  return fields;
}

async function searchFile(ctx: SearchCtx, filePath: string, hits: SearchHit[], warnings: string[], state: InspectState): Promise<void> {
  if (hits.length >= ctx.maxMatches) {
    return;
  }
  const rel = relPath(ctx.root, filePath);
  const name = path.basename(filePath);

  if (
    ctx.filePattern !== undefined &&
    !wildcardMatch(ctx.filePattern, name) &&
    !wildcardMatch(ctx.filePattern, rel)
  ) {
    return;
  }
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  }
  catch (error) {
    warnings.push(`skipped ${rel}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  state.scannedFiles += 1;
  state.bytesRead += buffer.length;
  if (buffer.includes(0)) {
    warnings.push(`skipped ${rel}: binary content`);
    return;
  }

  const lines = buffer.toString("utf8").split(LN_SPLT_PAT);
  for (let index = 0; index < lines.length; index++) {
    if (hits.length >= ctx.maxMatches) {
      return;
    }
    const line = lines[index];
    if (!ctx.matcher.test(line)) {
      continue;
    }
    hits.push({
      rel,
      line: index + 1,
      text: line,
      fields: captureFields(line, ctx.extracts),
    });
  }
}

async function searchPath(ctx: SearchCtx, target: string, hits: SearchHit[], warnings: string[], state: InspectState): Promise<void> {
  if (hits.length >= ctx.maxMatches) {
    return;
  }
  const stat = await fs.stat(target);

  if (stat.isFile()) {
    await searchFile(ctx, target, hits, warnings, state);
    return;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a file or directory: ${target}`);
  }
  for (const entry of await readDirSorted(target)) {
    if (hits.length >= ctx.maxMatches) {
      warnings.push("maxMatches reached");
      return;
    }
    if (entry.isDirectory) {
      if (ctx.recursive && entry.name !== ".git") {
        // biome-ignore lint/performance/noAwaitInLoops: Hits append in deterministic path order up to maxMatches.
        await searchPath(ctx, entry.full, hits, warnings, state);
      }
    }
    else {
      await searchFile(ctx, entry.full, hits, warnings, state);
    }
  }
}

async function searchAnswer(root: string, request: InspectRequest, id: string, state: InspectState): Promise<InspectAnswer> {
  const op = "search";
  let target: string;

  try {
    target = await requestPath(root, request.path);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
  if (typeof request.pattern !== "string") {
    return answerError(id, op, "pattern must be a string");
  }
  let matcher: RegExp;
  let extracts: ExtractSpec[];
  try {
    matcher = buildSearchRegex(request.pattern, request.literal);
    extracts = buildExtractSpecs(request);
  }
  catch (error) {
    return answerError(id, op, `Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`);
  }
  const hits: SearchHit[] = [];
  const warnings: string[] = [];
  const ctx: SearchCtx = {
    root,
    recursive: request.recursive ?? true,
    filePattern: request.filePattern,
    matcher,
    extracts,
    maxMatches: request.maxMatches,
  };

  try {
    await searchPath(ctx, target, hits, warnings, state);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
  if (hits.length === 0) {
    warnings.push("no matches");
    return answerOf(id, op, "partial", {matches: 0}, "low", [], warnings);
  }

  const value: Record<string, unknown> = {
    matches: hits.length,
    path: hits[0].rel,
    ...hits[0].fields,
  };
  const evidence: InspectEvidence[] = [];
  for (const hit of hits) {
    addEvidence(evidence, hit.rel, hit.line, hit.line, hit.text, state);
  }
  if (hits.length > 1) {
    warnings.push("multiple matches");
  }
  const confidence: InspectConfidence = hits.length === 1 ? "high" : "medium";

  return answerOf(id, op, "ok", value, confidence, evidence, warnings);
}

// 8. JSON pointer picks ---------------------------------------------------------------------------
function jsonPointerPick(value: unknown, pointer: string): {found: boolean; value: unknown} {
  if (pointer === "") {
    return {found: true, value};
  }
  if (!pointer.startsWith("/")) {
    return {found: false, value: undefined};
  }
  let current: unknown = value;

  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replace(/~1/g, "/").replace(/~0/g, "~");

    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return {found: false, value: undefined};
      }
      current = current[index];
    }
    else if (typeof current === "object" && current !== null && Object.hasOwn(current, token)) {
      current = (current as Record<string, unknown>)[token];
    }
    else {
      return {found: false, value: undefined};
    }
  }
  return {found: true, value: current};
}

async function jsonPickAnswer(root: string, request: InspectRequest, id: string, state: InspectState): Promise<InspectAnswer> {
  const op = "json-pick";
  let target: string;

  try {
    target = await requestPath(root, request.path);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
  if (!Array.isArray(request.pointers)) {
    return answerError(id, op, "pointers must be an array");
  }
  let text: string;
  try {
    text = await fs.readFile(target, "utf8");
  }
  catch (error) {
    return answerError(id, op, `Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
  }
  state.scannedFiles += 1;
  state.bytesRead += text.length;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  }
  catch (error) {
    return answerError(id, op, `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const values: Record<string, unknown> = {};
  const warnings: string[] = [];
  const evidence: InspectEvidence[] = [];
  for (const pointer of request.pointers) {
    const picked = jsonPointerPick(parsed, pointer);

    if (picked.found) {
      values[pointer] = picked.value;
      addEvidence(evidence, relPath(root, target), null, null, `${pointer} = ${JSON.stringify(picked.value) ?? "null"}`, state);
    }
    else {
      warnings.push(`missing pointer: ${pointer}`);
    }
  }
  const status: InspectStatus = warnings.length === 0 ? "ok" : "partial";
  const confidence: InspectConfidence = warnings.length === 0 ? "high" : "medium";

  return answerOf(id, op, status, {path: relPath(root, target), values}, confidence, evidence, warnings);
}

// 9. Snippet collection ---------------------------------------------------------------------------
function pushSnippetRange(ranges: [number, number][], start: number, end: number): void {
  const last = ranges.at(-1);

  if (last !== undefined && start <= last[1]) {
    last[1] = Math.max(last[1], end);
    return;
  }
  ranges.push([start, end]);
}

async function snippetAnswer(root: string, request: InspectRequest, id: string, state: InspectState): Promise<InspectAnswer> {
  const op = "snippet";
  let target: string;

  try {
    target = await requestPath(root, request.path);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
  if (!Array.isArray(request.patterns)) {
    return answerError(id, op, "patterns must be a string array");
  }
  const context = request.contextLines;
  const maxSnips = request.maxSnippets;
  let text: string;
  try {
    text = await fs.readFile(target, "utf8");
  }
  catch (error) {
    return answerError(id, op, `Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
  }
  state.scannedFiles += 1;
  state.bytesRead += text.length;

  const lines = text.split(LN_SPLT_PAT);
  const ranges: [number, number][] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!request.patterns.some((pattern) => lines[index].includes(pattern))) {
      continue;
    }
    const start = Math.max(0, index - context);
    const end = Math.min(index + context + 1, lines.length);

    pushSnippetRange(ranges, start, end);
    if (ranges.length >= maxSnips) {
      break;
    }
  }

  if (ranges.length === 0) {
    return answerOf(id, op, "partial", {path: relPath(root, target), matches: 0}, "low", [], ["no snippets matched"]);
  }
  const evidence: InspectEvidence[] = [];
  for (const [start, end] of ranges) {
    const snippet = lines
      .slice(start, end)
      .map((line, offset) => `${start + offset + 1}: ${line}`)
      .join("\n");

    addEvidence(evidence, relPath(root, target), start + 1, end, snippet, state);
  }
  return answerOf(id, op, "ok", {
    path: relPath(root, target),
    matches: ranges.length,
    ranges: ranges.map(([start, end]) => ({lineStart: start + 1, lineEnd: end})),
  }, "high", evidence, []);
}

// 10. Git status inspection -----------------------------------------------------------------------
// Composite op: folds a git status/branch lookup into the same fs-inspect call so file reads,
// content search, and a git resolve land in ONE tool round-trip instead of three.
async function gitStatusAnswer(root: string, request: InspectRequest, id: string): Promise<InspectAnswer> {
  const op = "git-status";
  const target = request.path ?? root;

  try {
    const parsedArgs = GT_INPT_SCHS["git-status"].parse({path: target});
    const result = await exctGtTl("git-status", parsedArgs);

    if (result.isError === true) {
      const message = result.content[0]?.text ?? "git-status failed";
      return answerError(id, op, String(message));
    }
    return answerOf(id, op, "ok", result.structuredContent ?? null, "high", [], []);
  }
  catch (error) {
    return answerError(id, op, error instanceof Error ? error.message : String(error));
  }
}

// 11. Request dispatch ----------------------------------------------------------------------------
async function runRequest(root: string, request: InspectRequest, index: number, state: InspectState): Promise<InspectAnswer> {
  const id = request.id ?? `request-${index}`;

  if (request.op === "count-files") {
    return countFilesAnswer(root, request, id, state);
  }
  if (request.op === "search") {
    return searchAnswer(root, request, id, state);
  }
  if (request.op === "json-pick") {
    return jsonPickAnswer(root, request, id, state);
  }
  if (request.op === "snippet") {
    return snippetAnswer(root, request, id, state);
  }
  if (request.op === "git-status") {
    return gitStatusAnswer(root, request, id);
  }
  return answerError(id, String(request.op), `Unsupported op: ${request.op}`);
}

function inspectStatus(answers: InspectAnswer[]): InspectStatus {
  if (answers.every((answer) => answer.status === "error")) {
    return "error";
  }
  const hasError = answers.some((answer) => answer.status === "error");
  const hasPartial = answers.some((answer) => answer.status === "partial");

  if (hasError || hasPartial) {
    return "partial";
  }
  return "ok";
}

// 12. FS inspect entry ----------------------------------------------------------------------------
export async function runFsInspect(args: unknown): Promise<ServerResult> {
  const parsed = InspArSc.parse(args);
  let root: string;

  try {
    root = await inspectRoot(parsed.root);
  }
  catch (error) {
    return crtErrRes(error instanceof Error ? error.message : String(error));
  }
  const state: InspectState = {
    maxChars: parsed.maxSnippetChars,
    usedChars: 0,
    scannedFiles: 0,
    bytesRead: 0,
    truncated: false,
  };
  const answers: InspectAnswer[] = [];

  for (const [index, request] of parsed.requests.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: Requests share the snippet budget and must run in declared order.
    answers.push(await runRequest(root, request, index + 1, state));
  }
  const status = inspectStatus(answers);
  const text = `fs-inspect: ${answers.length} requests, status=${status}, snippetChars=${state.usedChars}`;

  return {
    content: [{text, type: "text"}],
    structuredContent: {
      status,
      mode: parsed.mode,
      answers,
      metrics: {
        scannedFiles: state.scannedFiles,
        bytesRead: state.bytesRead,
        snippetChars: state.usedChars,
        truncated: state.truncated,
      },
    },
  };
}
