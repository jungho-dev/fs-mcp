/**
 * @file src/features/git/git-service.ts
 * @description Git tool service operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ServerResult } from "@assets/type/common";
import { createToolTextResponse } from "@cores/responses/responses-tool-result";
import { readFileInternal, validatePath } from "@features/filesystem/filesystem-service";
import type { GIT_INPUT_SCHEMAS, GitToolName } from "@schemas/schemas-git";
import type { z } from "zod";

type GitArgsMap = {
  [K in GitToolName]: z.infer<(typeof GIT_INPUT_SCHEMAS)[K]>;
};

type GitCommandError = Error & {
  code?: number | string | null;
  stdout?: string;
  stderr?: string;
};

type GitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type GitStatusBucket = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
  renamed?: string[];
  copied?: string[];
};

type GitWorkingTreeBucket = {
  added?: string[];
  modified?: string[];
  deleted?: string[];
};

type GitStatusSummary = {
  currentBranch: string | null;
  upstream?: string;
  ahead?: number;
  behind?: number;
  isClean: boolean;
  stagedChanges: GitStatusBucket;
  unstagedChanges: GitWorkingTreeBucket;
  untrackedFiles: string[];
  conflictedFiles: string[];
};

const execFileAsync = promisify(execFile);
const GIT_EXEC_MAX_BUFFER = 20 * 1024 * 1024;
const AUTO_EXCLUDE_PATTERNS = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "poetry.lock", "Pipfile.lock", "uv.lock", "composer.lock", "Gemfile.lock", "go.sum", "Cargo.lock", "flake.lock", "pubspec.lock", "mix.lock", "Podfile.lock", "packages.lock.json"] as const;
const PROTECTED_BRANCHES = new Set(["main", "master", "production", "prod", "release"]);
const CONFLICT_STATUS_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const CARRIAGE_RETURN_LINE_ENDING_PATTERN = /\r\n/g;
const CARRIAGE_RETURN_PATTERN = /\r/g;
const ESCAPED_NEWLINE_PATTERN = /\\n/g;
const ESCAPED_CARRIAGE_RETURN_PATTERN = /\\r/g;
const ESCAPED_TAB_PATTERN = /\\t/g;
const BRANCH_TRACK_PATTERN = /^([^\s]+)(?: \[(.*)\])?$/;
const AHEAD_PATTERN = /ahead (\d+)/;
const BEHIND_PATTERN = /behind (\d+)/;
const REMOTE_LINE_PATTERN = /^([^\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/;
const WRAPPED_REFS_PATTERN = /^\((.*)\)$/;
const GPG_SIGN_PATTERN = /gpg|sign/i;
const CLEAN_REMOVED_PATTERN = /(?:Would remove|Removing)\s+(.+)$/;
const TRAILING_PATH_SEPARATOR_PATTERN = /[\\/]+$/;
const FETCH_PRUNED_REF_PATTERN = /prune|deleted/i;
const PUSH_REJECTED_REF_PATTERN = /\[rejected\]/i;
const STASH_INDEX_PATTERN = /stash@\{(\d+)\}/;
const STASH_CREATED_PATTERN = /stash@\{\d+\}/;
const STASH_BRANCH_PREFIX_PATTERN = /^On\s+/;
const GIT_FORMAT_FIELD_SEPARATOR = "%x1f";
const GIT_FORMAT_RECORD_SEPARATOR = "%x1e";
const RECENT_COMMIT_FORMAT = `${["%H", "%an", "%aI", "%s"].join(GIT_FORMAT_FIELD_SEPARATOR)}${GIT_FORMAT_RECORD_SEPARATOR}`;
const RECENT_TAG_FORMAT = ["%(refname:short)", "%(creatordate:iso-strict)", "%(taggername)", "%(taggeremail)", "%(subject)", "%(body)"].join(GIT_FORMAT_FIELD_SEPARATOR);
const COMMIT_SUMMARY_FORMAT = ["%H", "%an <%ae>", "%ct", "%s"].join(GIT_FORMAT_FIELD_SEPARATOR);
const SIGNATURE_STATUS_FORMAT = "%G?";
const GIT_LOG_FORMAT = `${["%H", "%h", "%an", "%ae", "%ct", "%P", "%d", "%s", "%b"].join(GIT_FORMAT_FIELD_SEPARATOR)}${GIT_FORMAT_RECORD_SEPARATOR}`;
// biome-ignore lint/security/noSecrets: Git for-each-ref format atoms are not secrets.
const BRANCH_LIST_FORMAT = ["%(refname:short)", "%(HEAD)", "%(objectname)", "%(upstream:short)", "%(upstream:track)"].join(GIT_FORMAT_FIELD_SEPARATOR);
const REFLOG_FORMAT = ["%gD", "%H", "%gs", "%ct"].join(GIT_FORMAT_FIELD_SEPARATOR);
const STASH_LIST_FORMAT = ["%gd", "%ct", "%gs"].join(GIT_FORMAT_FIELD_SEPARATOR);
// biome-ignore lint/security/noSecrets: Git for-each-ref format atoms are not secrets.
const TAG_LIST_FORMAT = ["%(refname:short)", "%(objectname)", "%(creatordate:unix)", "%(taggername)", "%(taggeremail)", "%(subject)", "%(body)"].join(GIT_FORMAT_FIELD_SEPARATOR);
const CHANGELOG_COMMIT_FORMAT = `${["%h", "%an", "%ct", "%d", "%s"].join(GIT_FORMAT_FIELD_SEPARATOR)}${GIT_FORMAT_RECORD_SEPARATOR}`;
const WORKTREE_BLOCK_SPLIT_PATTERN = /\r?\n\r?\n/;
const BLAME_HEADER_PATTERN = /^[0-9a-f]{40}\s+\d+\s+\d+/;

let currentGitWorkingDirectory: string | null = null;

// 1. Execute git tool ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function executeGitTool<TName extends GitToolName>(name: TName, args: GitArgsMap[TName]): Promise<ServerResult> {
  let response: ServerResult;

  switch (name) {
    case "git_add":
      response = createJsonResponse(await runGitAdd(args as GitArgsMap["git_add"]));
      break;
    case "git_blame":
      response = createJsonResponse(await runGitBlame(args as GitArgsMap["git_blame"]));
      break;
    case "git_branch":
      response = createJsonResponse(await runGitBranch(args as GitArgsMap["git_branch"]));
      break;
    case "git_changelog_analyze":
      response = createJsonResponse(await runGitChangelogAnalyze(args as GitArgsMap["git_changelog_analyze"]));
      break;
    case "git_checkout":
      response = createJsonResponse(await runGitCheckout(args as GitArgsMap["git_checkout"]));
      break;
    case "git_cherry_pick":
      response = createJsonResponse(await runGitCherryPick(args as GitArgsMap["git_cherry_pick"]));
      break;
    case "git_clean":
      response = createJsonResponse(await runGitClean(args as GitArgsMap["git_clean"]));
      break;
    case "git_clear_working_dir":
      response = createJsonResponse(await runGitClearWorkingDir());
      break;
    case "git_clone":
      response = createJsonResponse(await runGitClone(args as GitArgsMap["git_clone"]));
      break;
    case "git_commit":
      response = createJsonResponse(await runGitCommit(args as GitArgsMap["git_commit"]));
      break;
    case "git_diff":
      response = createJsonResponse(await runGitDiff(args as GitArgsMap["git_diff"]));
      break;
    case "git_fetch":
      response = createJsonResponse(await runGitFetch(args as GitArgsMap["git_fetch"]));
      break;
    case "git_init":
      response = createJsonResponse(await runGitInit(args as GitArgsMap["git_init"]));
      break;
    case "git_log":
      response = createJsonResponse(await runGitLog(args as GitArgsMap["git_log"]));
      break;
    case "git_merge":
      response = createJsonResponse(await runGitMerge(args as GitArgsMap["git_merge"]));
      break;
    case "git_pull":
      response = createJsonResponse(await runGitPull(args as GitArgsMap["git_pull"]));
      break;
    case "git_push":
      response = createJsonResponse(await runGitPush(args as GitArgsMap["git_push"]));
      break;
    case "git_rebase":
      response = createJsonResponse(await runGitRebase(args as GitArgsMap["git_rebase"]));
      break;
    case "git_reflog":
      response = createJsonResponse(await runGitReflog(args as GitArgsMap["git_reflog"]));
      break;
    case "git_remote":
      response = createJsonResponse(await runGitRemote(args as GitArgsMap["git_remote"]));
      break;
    case "git_reset":
      response = createJsonResponse(await runGitReset(args as GitArgsMap["git_reset"]));
      break;
    case "git_set_working_dir":
      response = createJsonResponse(await runGitSetWorkingDir(args as GitArgsMap["git_set_working_dir"]));
      break;
    case "git_show":
      response = createJsonResponse(await runGitShow(args as GitArgsMap["git_show"]));
      break;
    case "git_stash":
      response = createJsonResponse(await runGitStash(args as GitArgsMap["git_stash"]));
      break;
    case "git_status":
      response = createJsonResponse(await runGitStatus(args as GitArgsMap["git_status"]));
      break;
    case "git_tag":
      response = createJsonResponse(await runGitTag(args as GitArgsMap["git_tag"]));
      break;
    case "git_worktree":
      response = createJsonResponse(await runGitWorktree(args as GitArgsMap["git_worktree"]));
      break;
    case "git_wrapup_instructions":
      response = createJsonResponse(await runGitWrapupInstructions(args as GitArgsMap["git_wrapup_instructions"]));
      break;
    default:
      throw new Error(`Unsupported git tool: ${String(name)}`);
  }
  return response;
}
// 2. Create JSON response ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createJsonResponse(output: Record<string, unknown>): ServerResult {
  return createToolTextResponse(JSON.stringify(output, null, 2), { structuredContent: output });
}
// 3. Run git command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitCommand(args: string[], options: { cwd?: string; allowFailure?: boolean } = {}): Promise<GitCommandResult> {
  let commandResult: GitCommandResult;

  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: options.cwd,
      env: process.env,
      maxBuffer: GIT_EXEC_MAX_BUFFER,
      windowsHide: true,
    });
    commandResult = { stdout, stderr, exitCode: 0 };
  }
  catch (error) {
    const commandError = error as GitCommandError;
    const failedResult = {
      stdout: commandError.stdout ?? "",
      stderr: commandError.stderr ?? commandError.message,
      exitCode: typeof commandError.code === "number" ? commandError.code : 1,
    };

    if (options.allowFailure) {
    	commandResult = failedResult;
    }
    else {
    	const errorMessage = [failedResult.stderr.trim(), failedResult.stdout.trim()].filter((value) => value.length > 0).join("\n");
      throw new Error(errorMessage.length > 0 ? errorMessage : commandError.message);
    }
  }
  return commandResult;
}
// 4. Split lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function splitLines(text: string): string[] {
  return text
    .replace(CARRIAGE_RETURN_LINE_ENDING_PATTERN, "\n")
    .replace(CARRIAGE_RETURN_PATTERN, "\n")
    .split("\n")
    .filter((line) => line.length > 0);
}
// 5. Normalize commit message ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function normalizeCommitMessage(message: string): string {
  return message.replace(ESCAPED_NEWLINE_PATTERN, "\n").replace(ESCAPED_CARRIAGE_RETURN_PATTERN, "\r").replace(ESCAPED_TAB_PATTERN, "\t");
}
// 6. Resolve git text argument ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveGitTextArgument(value: string | undefined, filePath: string | undefined, offset: number, length: number | undefined, label: string): Promise<string | undefined> {
  if (value !== undefined) {
    return value;
  }
  if (filePath === undefined) {
    return undefined;
  }
  const text = await readFileInternal(filePath, offset, length);
  if (text.length === 0) {
    throw new Error(`${label} file is empty: ${filePath}`);
  }
  return text;
}
// 7. Require git text argument ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function requireGitTextArgument(value: string | undefined, filePath: string | undefined, offset: number, length: number | undefined, label: string): Promise<string> {
  const text = await resolveGitTextArgument(value, filePath, offset, length, label);
  if (text === undefined) {
    throw new Error(`${label} is required`);
  }
  return text;
}
// 8. Resolve existing path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveExistingPath(requestedPath: string): Promise<string> {
  return await validatePath(requestedPath);
}
// 9. Resolve creation path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveCreationPath(requestedPath: string): Promise<string> {
  const validatedPath = await validatePath(requestedPath);
  return path.resolve(validatedPath);
}
// 10. Ensure directory exists ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function ensureDirectoryExists(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}
// 11. Get repository root ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getRepositoryRoot(cwd: string): Promise<string> {
  const commandResult = await runGitCommand(["rev-parse", "--show-toplevel"], { cwd });
  return commandResult.stdout.trim();
}
// 10. Resolve repository path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveRepositoryPath(requestedPath?: string): Promise<string> {
  const basePath = requestedPath ?? currentGitWorkingDirectory;

  if (!basePath) {
  	throw new Error("No git working directory set. Pass path or call git_set_working_dir first.");
  }
  return await getRepositoryRoot(await resolveExistingPath(basePath));
}
// 11. Resolve creation base path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function resolveCreationBasePath(requestedPath?: string): Promise<string> {
  const basePath = requestedPath ?? currentGitWorkingDirectory ?? process.cwd();
  return await resolveCreationPath(basePath);
}
// 12. Get head commit ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getHeadCommit(cwd: string): Promise<string | null> {
  const commandResult = await runGitCommand(["rev-parse", "HEAD"], { cwd, allowFailure: true });
  const headCommit = commandResult.exitCode === 0 ? commandResult.stdout.trim() : "";
  return headCommit.length > 0 ? headCommit : null;
}
// 13. Get current branch ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getCurrentBranch(cwd: string): Promise<string | null> {
  const commandResult = await runGitCommand(["branch", "--show-current"], { cwd, allowFailure: true });
  const branchName = commandResult.stdout.trim();
  return branchName.length > 0 ? branchName : null;
}
// 14. Is protected branch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isProtectedBranch(branchName: string | null): boolean {
  return branchName !== null && PROTECTED_BRANCHES.has(branchName.toLowerCase());
}
// 15. Ensure protected branch confirmation ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function ensureProtectedBranchConfirmation(cwd: string, confirmed: boolean | undefined, reason: string): Promise<void> {
  const branchName = await getCurrentBranch(cwd);

  if (isProtectedBranch(branchName) && confirmed !== true) {
  	throw new Error(`${reason} requires confirmed: true on protected branches.`);
  }
}
// 16. Append unique ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function appendUnique(target: string[] | undefined, value: string): string[] {
  const normalizedTarget = target ?? [];

  if (!normalizedTarget.includes(value)) {
  	normalizedTarget.push(value);
  }
  return normalizedTarget;
}
// 17. Add index change ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function addIndexChange(bucket: GitStatusBucket, code: string, pathValue: string): void {
  if (code === "A") {
  	bucket.added = appendUnique(bucket.added, pathValue);
  }
  else if (code === "M") {
  	bucket.modified = appendUnique(bucket.modified, pathValue);
  }
  else if (code === "D") {
  	bucket.deleted = appendUnique(bucket.deleted, pathValue);
  }
  else if (code === "R") {
  	bucket.renamed = appendUnique(bucket.renamed, pathValue);
  }
  else if (code === "C") {
  	bucket.copied = appendUnique(bucket.copied, pathValue);
  }
}
// 18. Add working tree change ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function addWorkingTreeChange(bucket: GitWorkingTreeBucket, code: string, pathValue: string): void {
  if (code === "A") {
  	bucket.added = appendUnique(bucket.added, pathValue);
  }
  else if (code === "M") {
  	bucket.modified = appendUnique(bucket.modified, pathValue);
  }
  else if (code === "D") {
  	bucket.deleted = appendUnique(bucket.deleted, pathValue);
  }
}
// 19. Flatten bucket ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function flattenBucket(bucket: GitStatusBucket | GitWorkingTreeBucket): string[] {
  return Object.values(bucket).flatMap((value) => value ?? []);
}
// 20. Parse branch header ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseBranchHeader(line: string, summary: GitStatusSummary): void {
  const branchLine = line.slice(3);

  if (branchLine.startsWith("HEAD")) {
  	summary.currentBranch = null;
  }
  else if (branchLine.startsWith("No commits yet on ")) {
  	summary.currentBranch = branchLine.replace("No commits yet on ", "").trim();
  }
  else {
    const pieces = branchLine.split("...");
    const branchName = pieces[0].trim();

    summary.currentBranch = branchName.length > 0 ? branchName : null;
    if (pieces.length > 1) {
      const trackMatch = pieces[1].match(BRANCH_TRACK_PATTERN);

      if (trackMatch) {
        summary.upstream = trackMatch[1];
        if (trackMatch[2]) {
          const aheadMatch = trackMatch[2].match(AHEAD_PATTERN);
          const behindMatch = trackMatch[2].match(BEHIND_PATTERN);

          if (aheadMatch) {
          	summary.ahead = Number.parseInt(aheadMatch[1], 10);
          }
          if (behindMatch) {
          	summary.behind = Number.parseInt(behindMatch[1], 10);
          }
        }
      }
    }
  }
}
// 21. Parse status summary ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseStatusSummary(text: string, includeUntracked: boolean): GitStatusSummary {
  const summary: GitStatusSummary = {
    currentBranch: null,
    isClean: true,
    stagedChanges: {},
    unstagedChanges: {},
    untrackedFiles: [],
    conflictedFiles: [],
  };

  splitLines(text).forEach((line) => {
    if (line.startsWith("## ")) {
    	parseBranchHeader(line, summary);
    }
    else if (line.startsWith("?? ")) {
    	summary.untrackedFiles.push(line.slice(3));
    }
    else if (line.length >= 3) {
      const indexCode = line[0];
      const worktreeCode = line[1];
      const pathValue = line.slice(3);

      if (CONFLICT_STATUS_CODES.has(indexCode + worktreeCode)) {
      	const conflictPath = pathValue.includes(" -> ") ? (pathValue.split(" -> ").at(-1) ?? pathValue) : pathValue;
        summary.conflictedFiles.push(conflictPath);
      }
      if (indexCode !== " ") {
      	addIndexChange(summary.stagedChanges, indexCode, pathValue);
      }
      if (worktreeCode !== " ") {
      	addWorkingTreeChange(summary.unstagedChanges, worktreeCode, pathValue);
      }
    }
  });

  const trackedClean = flattenBucket(summary.stagedChanges).length === 0 && flattenBucket(summary.unstagedChanges).length === 0 && summary.conflictedFiles.length === 0;

  summary.isClean = includeUntracked ? trackedClean && summary.untrackedFiles.length === 0 : trackedClean;

  return summary;
}
// 22. Get status summary ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getStatusSummary(cwd: string, includeUntracked: boolean=true): Promise<GitStatusSummary> {
  const statusArgs = ["status", "--short", "--branch", includeUntracked ? "--untracked-files=all" : "--untracked-files=no"];
  const commandResult = await runGitCommand(statusArgs, { cwd });

  return parseStatusSummary(commandResult.stdout, includeUntracked);
}
// 23. To snake status ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function toSnakeStatus(summary: GitStatusSummary): Record<string, unknown> {
  return {
    current_branch: summary.currentBranch,
    ...(summary.upstream !== undefined ? { upstream: summary.upstream } : {}),
    ...(summary.ahead !== undefined ? { ahead: summary.ahead } : {}),
    ...(summary.behind !== undefined ? { behind: summary.behind } : {}),
    is_clean: summary.isClean,
    staged_changes: summary.stagedChanges,
    unstaged_changes: summary.unstagedChanges,
    untracked_files: summary.untrackedFiles,
    conflicted_files: summary.conflictedFiles,
  };
}
// 24. To snapshot status ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function toSnapshotStatus(summary: GitStatusSummary): Record<string, unknown> {
  return {
    branch: summary.currentBranch,
    ...(summary.upstream !== undefined ? { upstream: summary.upstream } : {}),
    ...(summary.ahead !== undefined ? { ahead: summary.ahead } : {}),
    ...(summary.behind !== undefined ? { behind: summary.behind } : {}),
    isClean: summary.isClean,
    staged: flattenBucket(summary.stagedChanges),
    unstaged: flattenBucket(summary.unstagedChanges),
    untracked: summary.untrackedFiles,
    conflicts: summary.conflictedFiles,
  };
}
// 25. Get remotes ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getRemotes(cwd: string): Promise<Record<string, string>[]> {
  const commandResult = await runGitCommand(["remote", "-v"], { cwd, allowFailure: true });
  const remoteMap = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>();

  splitLines(commandResult.stdout).forEach((line) => {
    const match = line.match(REMOTE_LINE_PATTERN);

    if (match) {
      const remoteName = match[1];
      const remoteUrl = match[2];
      const remoteMode = match[3];
      const currentRemote = remoteMap.get(remoteName) ?? { name: remoteName, fetchUrl: "", pushUrl: "" };

      if (remoteMode === "fetch") {
      	currentRemote.fetchUrl = remoteUrl;
      }
      else {
      	currentRemote.pushUrl = remoteUrl;
      }
      remoteMap.set(remoteName, currentRemote);
    }
  });

  return [...remoteMap.values()];
}
// 26. Get recent commits ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getRecentCommits(cwd: string, limit: number): Promise<Record<string, string>[]> {
  const commandResult = await runGitCommand(["log", `--max-count=${String(limit)}`, `--pretty=format:${RECENT_COMMIT_FORMAT}`], { cwd, allowFailure: true });

  if (commandResult.exitCode !== 0) {
  	return [];
  }
  return commandResult.stdout
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split("\x1f");
      return {
        hash: parts[0],
        author: parts[1],
        date: parts[2],
        subject: parts[3],
      };
    });
}
// 27. Get recent tags ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getRecentTags(cwd: string, limit: number): Promise<Record<string, string>[]> {
  const commandResult = await runGitCommand(["for-each-ref", "refs/tags", "--sort=-creatordate", `--count=${String(limit)}`, `--format=${RECENT_TAG_FORMAT}`], { cwd, allowFailure: true });

  if (commandResult.exitCode !== 0) {
  	return [];
  }
  return splitLines(commandResult.stdout).map((line) => {
    const parts = line.split("\x1f");
    const tagger = parts[2] ? parts[2] + (parts[3] ? ` <${parts[3]}>` : "") : "";

    return {
      name: parts[0],
      ...(parts[1] ? { date: parts[1] } : {}),
      ...(tagger ? { tagger } : {}),
      ...(parts[4] ? { annotationSubject: parts[4] } : {}),
      ...(parts[5] ? { annotationBody: parts[5] } : {}),
    };
  });
}
// 28. Gather repository snapshot ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function gatherRepositorySnapshot(cwd: string): Promise<Record<string, unknown>> {
  const status = await getStatusSummary(cwd, true);
  const recentCommits = await getRecentCommits(cwd, 2);
  const recentTags = await getRecentTags(cwd, 2);
  const remotes = await getRemotes(cwd);

  return {
    status: toSnapshotStatus(status),
    recentCommits,
    recentTags,
    remotes,
  };
}
// 29. Get changed files between ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getChangedFilesBetween(cwd: string, left: string, right: string): Promise<string[]> {
  const commandResult = await runGitCommand(["diff", "--name-only", left, right], { cwd, allowFailure: true });
  return splitLines(commandResult.stdout);
}
// 30. Get conflicted files ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function getConflictedFiles(cwd: string): Promise<string[]> {
  const status = await getStatusSummary(cwd, true);
  return status.conflictedFiles;
}
// 31. Sum numstat ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function sumNumstat(text: string): { filesChanged: number; insertions?: number; deletions?: number } {
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  splitLines(text).forEach((line) => {
    const parts = line.split("\t");
    const added = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10);
    const removed = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10);

    if (!Number.isNaN(added) && !Number.isNaN(removed)) {
    	filesChanged += 1;
      insertions += added;
      deletions += removed;
    }
  });

  return {
    filesChanged,
    ...(filesChanged > 0 ? { insertions, deletions } : {}),
  };
}
// 32. Parse refs ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function parseRefs(refText: string | undefined): string[] | undefined {
  if (!refText) {
  	return ;
  }
  const normalized = refText.trim();

  if (!normalized || normalized === "()") {
  	return ;
  }
  const refs = normalized
    .replace(WRAPPED_REFS_PATTERN, "$1")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return refs.length > 0 ? refs : undefined;
}
// 33. Run git set working dir ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitSetWorkingDir(input: GitArgsMap["git_set_working_dir"]): Promise<Record<string, unknown>> {
  const resolvedPath = await resolveCreationPath(input.path);
  const shouldValidateRepository = input.validateGitRepo ?? true;
  const shouldInitializeRepository = input.initializeIfNotPresent ?? false;

  await ensureDirectoryExists(resolvedPath);

  if (shouldValidateRepository) {
    const repoCheck = await runGitCommand(["rev-parse", "--show-toplevel"], { cwd: resolvedPath, allowFailure: true });

    if (repoCheck.exitCode !== 0) {
      if (shouldInitializeRepository) {
        await runGitCommand(["init", "--initial-branch=main"], { cwd: resolvedPath });
      }
      else {
      	throw new Error(`Path is not a git repository: ${resolvedPath}. Pass initializeIfNotPresent: true to run git init here.`);
      }
    }
    currentGitWorkingDirectory = await getRepositoryRoot(resolvedPath);
  }
  else {
  	currentGitWorkingDirectory = resolvedPath;
  }
  let repository: Record<string, unknown> | undefined;
  let enrichmentWarnings: string[] | undefined;

  if (shouldValidateRepository) {
    try {
      repository = await gatherRepositorySnapshot(currentGitWorkingDirectory);
    }
    catch (error) {
      enrichmentWarnings = [`Repository snapshot skipped: ${error instanceof Error ? error.message : String(error)}`];
    }
  }
  return {
    success: true,
    path: currentGitWorkingDirectory,
    message: `Working directory set to: ${currentGitWorkingDirectory}`,
    ...(repository ? { repository } : {}),
    ...(enrichmentWarnings ? { enrichmentWarnings } : {}),
  };
}
// 34. Run git clear working dir ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitClearWorkingDir(): Promise<Record<string, unknown>> {
  const previousPath = currentGitWorkingDirectory;

  currentGitWorkingDirectory = null;

  return {
    success: true,
    message: "Cleared git working directory.",
    ...(previousPath ? { previousPath } : {}),
  };
}
// 35. Run git status ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitStatus(input: GitArgsMap["git_status"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const includeUntracked = input.includeUntracked ?? true;
  const status = await getStatusSummary(cwd, includeUntracked);

  return {
    success: true,
    currentBranch: status.currentBranch,
    ...(status.upstream !== undefined ? { upstream: status.upstream } : {}),
    ...(status.ahead !== undefined ? { ahead: status.ahead } : {}),
    ...(status.behind !== undefined ? { behind: status.behind } : {}),
    isClean: status.isClean,
    stagedChanges: status.stagedChanges,
    unstagedChanges: status.unstagedChanges,
    untrackedFiles: status.untrackedFiles,
    conflictedFiles: status.conflictedFiles,
  };
}
// 36. Run git init ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitInit(input: GitArgsMap["git_init"]): Promise<Record<string, unknown>> {
  const targetPath = await resolveCreationBasePath(input.path);
  const initialBranch = input.initialBranch ?? "main";

  await ensureDirectoryExists(targetPath);
  await runGitCommand(["init", `--initial-branch=${initialBranch}`, ...(input.bare ? ["--bare"] : [])], { cwd: targetPath });

  return {
    success: true,
    path: targetPath,
    initialBranch,
    isBare: input.bare === true,
  };
}
// 37. Run git clone ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitClone(input: GitArgsMap["git_clone"]): Promise<Record<string, unknown>> {
  const destinationPath = await resolveCreationPath(input.path);

  await ensureDirectoryExists(path.dirname(destinationPath));
  await runGitCommand(["clone", ...(input.bare ? ["--bare"] : []), ...(input.mirror ? ["--mirror"] : []), ...(input.branch ? ["--branch", input.branch] : []), ...(input.depth ? [`--depth=${String(input.depth)}`] : []), input.url, destinationPath]);

  const headCommit = await getHeadCommit(destinationPath);

  return {
    success: true,
    path: destinationPath,
    remoteUrl: input.url,
    branch: input.branch ?? (await getCurrentBranch(destinationPath)) ?? "HEAD",
    ...(headCommit ? { commitHash: headCommit } : {}),
  };
}
// 38. Run git add ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitAdd(input: GitArgsMap["git_add"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);

  await runGitCommand(
    [
      "add",
      ...(input.all ? ["--all"] : []),
      ...(input.update ? ["--update"] : []),
      ...(input.force ? ["--force"] : []),
      ...(input.paths && input.paths.length > 0 ? input.paths : input.all ? [] : ["."]),
    ],
    { cwd },
  );

  const status = await getStatusSummary(cwd, true);
  const stagedFiles = flattenBucket(status.stagedChanges);

  return {
    success: true,
    stagedFiles,
    totalFiles: stagedFiles.length,
    status: toSnakeStatus(status),
  };
}
// 39. Run git commit ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitCommit(input: GitArgsMap["git_commit"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const commitMessage = await requireGitTextArgument(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");

  if (input.filesToStage && input.filesToStage.length > 0) {
    await runGitCommand(["add", ...input.filesToStage], { cwd });
  }
  const commitArgs = ["commit", "-m", normalizeCommitMessage(commitMessage), ...(input.amend ? ["--amend"] : []), ...(input.allowEmpty ? ["--allow-empty"] : []), ...(input.noVerify ? ["--no-verify"] : []), ...(input.author ? ["--author", `${input.author.name} <${input.author.email}>`] : [])];
  let signingWarning: string | undefined;
  let commitResult = await runGitCommand(commitArgs, { cwd, allowFailure: true });

  if (commitResult.exitCode !== 0) {
    const combinedFailure = [commitResult.stderr, commitResult.stdout].join("\n");
    if (GPG_SIGN_PATTERN.test(combinedFailure)) {
      signingWarning = combinedFailure.trim();
      commitResult = await runGitCommand([...commitArgs, "--no-gpg-sign"], { cwd, allowFailure: true });
    }
  }
  if (commitResult.exitCode !== 0) {
  	throw new Error([commitResult.stderr.trim(), commitResult.stdout.trim()].filter((value) => value.length > 0).join("\n"));
  }
  const headCommit = await getHeadCommit(cwd);

  if (!headCommit) {
  	throw new Error("Commit completed but HEAD is unavailable.");
  }
  const summaryResult = await runGitCommand(["show", "--stat", `--format=${COMMIT_SUMMARY_FORMAT}`, "-1", headCommit], { cwd });
  const headerLine = splitLines(summaryResult.stdout)[0];
  const headerParts = headerLine.split("\x1f");
  const numstatResult = await runGitCommand(["show", "--numstat", "--format=", "-1", headCommit], { cwd, allowFailure: true });
  const changedFilesResult = await runGitCommand(["diff-tree", "--no-commit-id", "--name-only", "-r", headCommit], { cwd, allowFailure: true });
  const signatureResult = await runGitCommand(["log", "-1", `--pretty=format:${SIGNATURE_STATUS_FORMAT}`], { cwd, allowFailure: true });
  const status = await getStatusSummary(cwd, true);
  const diffStats = sumNumstat(numstatResult.stdout);
  const committedFiles = splitLines(changedFilesResult.stdout);

  return {
    success: true,
    commitHash: headerParts[0],
    author: headerParts[1],
    timestamp: Number.parseInt(headerParts[2], 10),
    message: headerParts[3],
    filesChanged: committedFiles.length,
    committedFiles,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    signed: signatureResult.stdout.trim().length > 0 && signatureResult.stdout.trim() !== "N",
    ...(signingWarning ? { signingWarning } : {}),
    status: toSnakeStatus(status),
  };
}
// 40. Run git diff ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitDiff(input: GitArgsMap["git_diff"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const contextLines = input.contextLines ?? 3;
  const autoExclude = input.autoExclude ?? true;
  const diffRange = [...(input.staged ? ["--cached"] : []), ...(input.source ? [input.source] : []), ...(!input.source && input.target ? [input.target] : []), ...(input.source && input.target ? [input.target] : [])];
  const pathspecs = input.paths && input.paths.length > 0 ? [...input.paths] : ["."];
  const excludeSpecs = autoExclude ? AUTO_EXCLUDE_PATTERNS.map((pattern) => `:(exclude)${pattern}`) : [];
  const diffArgs = ["diff", ...(input.nameOnly ? ["--name-only"] : []), ...(input.stat ? ["--stat"] : []), `--unified=${String(contextLines)}`, ...diffRange, "--", ...pathspecs, ...excludeSpecs];
  const diffResult = await runGitCommand(diffArgs, { cwd });
  const numstatResult = await runGitCommand(["diff", "--numstat", ...diffRange, "--", ...pathspecs, ...excludeSpecs], { cwd, allowFailure: true });
  const diffStats = sumNumstat(numstatResult.stdout);
  let diffText = diffResult.stdout;
  let untrackedFiles: string[] = [];

  if (input.includeUntracked) {
    const untrackedResult = await runGitCommand(["ls-files", "--others", "--exclude-standard"], { cwd, allowFailure: true });
    untrackedFiles = splitLines(untrackedResult.stdout);
    if (untrackedFiles.length > 0) {
    	diffText = diffText.length > 0 ? `${diffText}\n\n# Untracked files\n${untrackedFiles.join("\n")}` : `# Untracked files\n${untrackedFiles.join("\n")}`;
    }
  }
  const excludedFiles = autoExclude ? (await runGitCommand(["diff", "--name-only", ...diffRange, "--", ...pathspecs], { cwd, allowFailure: true })).stdout
        .replace(CARRIAGE_RETURN_LINE_ENDING_PATTERN, "\n")
        .split("\n")
        .filter((value) => value.length > 0)
        .filter((value) => AUTO_EXCLUDE_PATTERNS.includes(path.basename(value) as (typeof AUTO_EXCLUDE_PATTERNS)[number])) : [];

  return {
    success: true,
    diff: diffText,
    filesChanged: diffStats.filesChanged + untrackedFiles.length,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    ...(excludedFiles.length > 0 ? { excludedFiles } : {}),
  };
}
// 41. Run git log ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitLog(input: GitArgsMap["git_log"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const maxCount = input.maxCount ?? 20;
  const logArgs = ["log", `--max-count=${String(maxCount)}`, ...(input.skip !== undefined ? [`--skip=${String(input.skip)}`] : []), ...(input.author ? [`--author=${input.author}`] : []), ...(input.grep ? [`--grep=${input.grep}`] : []), ...(input.since ? [`--since=${input.since}`] : []), ...(input.until ? [`--until=${input.until}`] : []), ...(input.showSignature ? ["--show-signature"] : []), `--pretty=format:${GIT_LOG_FORMAT}`, ...(input.branch ? [input.branch] : []), ...(input.filePath ? ["--", input.filePath] : [])];
  const commandResult = await runGitCommand(logArgs, { cwd, allowFailure: true });

  if (commandResult.exitCode !== 0) {
    return {
      success: true,
      commits: [],
      totalCount: 0,
      ...(input.branch || input.author || input.grep || input.filePath || input.since || input.until ? { note: "No commits matched the provided filters." } : {}),
    };
  }
  const commits: Record<string, unknown>[] = [];
  const entries = commandResult.stdout
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    const parts = entry.split("\x1f");
    const commitRecord: Record<string, unknown> = {
      hash: parts[0],
      shortHash: parts[1],
      subject: parts[7],
    };

    if (!input.oneline) {
      Object.assign(commitRecord, {
        author: parts[2],
        authorEmail: parts[3],
        timestamp: Number.parseInt(parts[4], 10),
        ...(parts[5] ? { parents: parts[5].split(" ").filter((value) => value.length > 0) } : {}),
        ...(parseRefs(parts[6]) ? { refs: parseRefs(parts[6]) } : {}),
        ...(parts[8] ? { body: parts[8] } : {}),
      });

      if (input.stat) {
        // biome-ignore lint/performance/noAwaitInLoops: Per-commit git detail lookup preserves output order.
        const statResult = await runGitCommand(["show", "--stat", "--format=", parts[0]], { cwd, allowFailure: true });
        commitRecord.stat = statResult.stdout.trim();
      }
      if (input.patch) {
        const patchResult = await runGitCommand(["show", "--format=", "--patch", parts[0]], { cwd, allowFailure: true });
        commitRecord.patch = patchResult.stdout;
      }
    }
    commits.push(commitRecord);
  }
  return {
    success: true,
    commits,
    totalCount: commits.length,
  };
}
// 42. Run git show ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitShow(input: GitArgsMap["git_show"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const targetObject = input.filePath ? `${input.object}:${input.filePath}` : input.object;
  const showResult = await runGitCommand(["show", ...(input.format ? [`--format=${input.format}`] : []), ...(input.stat ? ["--stat"] : []), targetObject], { cwd });
  const typeResult = input.filePath ? { stdout: "blob" } : await runGitCommand(["cat-file", "-t", input.object], { cwd, allowFailure: true });

  return {
    success: true,
    object: input.object,
    type: typeResult.stdout.trim() || "commit",
    content: showResult.stdout,
  };
}
// 43. Run git branch ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitBranch(input: GitArgsMap["git_branch"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "list";

  if (mode === "show-current") {
    return {
      success: true,
      mode,
      currentBranch: await getCurrentBranch(cwd),
    };
  }
  if (mode === "create") {
    if (!input.branchName) {
    	throw new Error("branchName is required for create mode.");
    }
    await runGitCommand(["branch", ...(input.force ? ["--force"] : []), input.branchName, ...(input.startPoint ? [input.startPoint] : [])], { cwd });
    return { success: true, mode, message: `Created branch ${input.branchName}` };
  }
  if (mode === "delete") {
    if (!input.branchName) {
    	throw new Error("branchName is required for delete mode.");
    }
    await runGitCommand(["branch", ...(input.force ? ["-D"] : ["-d"]), input.branchName], { cwd });
    return { success: true, mode, message: `Deleted branch ${input.branchName}` };
  }
  if (mode === "rename") {
    if (!input.branchName || !input.newBranchName) {
    	throw new Error("branchName and newBranchName are required for rename mode.");
    }
    await runGitCommand(["branch", ...(input.force ? ["-M"] : ["-m"]), input.branchName, input.newBranchName], { cwd });
    return { success: true, mode, message: `Renamed branch ${input.branchName} to ${input.newBranchName}` };
  }
  const branchResult = await runGitCommand(
    [
      "for-each-ref",
      ...(input.limit ? [`--count=${String(input.limit)}`] : []),
      ...(input.merged === true ? ["--merged"] : []),
      ...(typeof input.merged === "string" ? [`--merged=${input.merged}`] : []),
      ...(input.noMerged === true ? ["--no-merged"] : []),
      ...(typeof input.noMerged === "string" ? [`--no-merged=${input.noMerged}`] : []),
      `--format=${BRANCH_LIST_FORMAT}`,
      ...(input.remote ? ["refs/remotes"] : input.all ? ["refs/heads", "refs/remotes"] : ["refs/heads"]),
    ],
    { cwd },
  );
  const branches = splitLines(branchResult.stdout).map((line) => {
    const parts = line.split("\x1f");
    const counts = parts[4] ?? "";
    const aheadMatch = counts.match(AHEAD_PATTERN);
    const behindMatch = counts.match(BEHIND_PATTERN);

    return {
      name: parts[0],
      current: parts[1] === "*",
      commitHash: parts[2],
      ...(parts[3] ? { upstream: parts[3] } : {}),
      ...(aheadMatch ? { ahead: Number.parseInt(aheadMatch[1], 10) } : {}),
      ...(behindMatch ? { behind: Number.parseInt(behindMatch[1], 10) } : {}),
    };
  });

  return {
    success: true,
    mode,
    branches,
  };
}
// 44. Run git checkout ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitCheckout(input: GitArgsMap["git_checkout"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);

  if (input.paths && input.paths.length > 0) {
    await runGitCommand(["checkout", input.target, "--", ...input.paths], { cwd });
    return { success: true, target: input.target, branchCreated: false, filesModified: input.paths };
  }
  if (input.createBranch) {
    await runGitCommand(["checkout", ...(input.force ? ["-f"] : []), "-b", input.target, ...(input.track ? ["--track"] : [])], { cwd });
    return { success: true, target: input.target, branchCreated: true, filesModified: [] };
  }
  await runGitCommand(["checkout", ...(input.force ? ["-f"] : []), input.target], { cwd });
  return { success: true, target: input.target, branchCreated: false, filesModified: [] };
}
// 45. Run git cherry pick ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitCherryPick(input: GitArgsMap["git_cherry_pick"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);

  if (input.abort) {
    await runGitCommand(["cherry-pick", "--abort"], { cwd });
    return { success: true, pickedCommits: [], conflicts: false, conflictedFiles: [] };
  }
  if (input.continueOperation) {
    const continueResult = await runGitCommand(["cherry-pick", "--continue"], { cwd, allowFailure: true });
    const conflictedFiles = await getConflictedFiles(cwd);

    return {
      success: continueResult.exitCode === 0,
      pickedCommits: [],
      conflicts: conflictedFiles.length > 0,
      conflictedFiles,
      ...(continueResult.exitCode !== 0 ? { message: continueResult.stderr.trim() || continueResult.stdout.trim() } : {}),
    };
  }
  if (!input.commits || input.commits.length === 0) {
  	throw new Error("commits is required for cherry-pick.");
  }
  const pickResult = await runGitCommand(["cherry-pick", ...(input.noCommit ? ["--no-commit"] : []), ...(input.mainline ? ["-m", String(input.mainline)] : []), ...(input.signoff ? ["--signoff"] : []), ...(input.strategy ? ["--strategy", input.strategy] : []), ...input.commits], { cwd, allowFailure: true });
  const conflictedFiles = await getConflictedFiles(cwd);

  return {
    success: pickResult.exitCode === 0,
    pickedCommits: pickResult.exitCode === 0 ? input.commits : [],
    conflicts: conflictedFiles.length > 0,
    conflictedFiles,
    ...(pickResult.exitCode !== 0 ? { message: pickResult.stderr.trim() || pickResult.stdout.trim() } : {}),
  };
}
// 46. Run git clean ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitClean(input: GitArgsMap["git_clean"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const cleanResult = await runGitCommand(["clean", ...(input.dryRun ? ["-n"] : []), ...(input.force ? ["-f"] : []), ...(input.directories ? ["-d"] : []), ...(input.ignored ? ["-x"] : [])], { cwd });
  const filesRemoved: string[] = [];
  const directoriesRemoved: string[] = [];

  splitLines(cleanResult.stdout).forEach((line) => {
    const match = line.match(CLEAN_REMOVED_PATTERN);

    if (match) {
      const candidate = match[1].trim();
      if (candidate.endsWith("/") || candidate.endsWith("\\")) {
        directoriesRemoved.push(candidate.replace(TRAILING_PATH_SEPARATOR_PATTERN, ""));
      }
      else {
      	filesRemoved.push(candidate);
      }
    }
  });

  return {
    success: true,
    dryRun: input.dryRun === true,
    filesRemoved,
    directoriesRemoved,
  };
}
// 47. Run git fetch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitFetch(input: GitArgsMap["git_fetch"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const remote = input.remote ?? "origin";
  const fetchResult = await runGitCommand(["fetch", remote, ...(input.depth ? [`--depth=${String(input.depth)}`] : []), ...(input.prune ? ["--prune"] : []), ...(input.tags ? ["--tags"] : [])], { cwd });

  return {
    success: true,
    remote,
    fetchedRefs: splitLines(fetchResult.stderr).filter((line) => line.includes("->")),
    prunedRefs: splitLines(fetchResult.stderr).filter((line) => FETCH_PRUNED_REF_PATTERN.test(line)),
  };
}
// 48. Run git merge ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitMerge(input: GitArgsMap["git_merge"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mergeMessage = await resolveGitTextArgument(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  const previousHead = await getHeadCommit(cwd);
  const mergeResult = await runGitCommand(["merge", ...(input.noFastForward ? ["--no-ff"] : []), ...(input.squash ? ["--squash"] : []), ...(mergeMessage ? ["-m", mergeMessage] : []), ...(input.strategy ? ["--strategy", input.strategy] : []), input.branch], { cwd, allowFailure: true });
  const currentHead = await getHeadCommit(cwd);
  const conflictedFiles = await getConflictedFiles(cwd);
  const mergedFiles = previousHead && currentHead && previousHead !== currentHead ? await getChangedFilesBetween(cwd, previousHead, currentHead) : [];

  return {
    success: mergeResult.exitCode === 0,
    conflicts: conflictedFiles.length > 0,
    conflictedFiles,
    fastForward: mergeResult.exitCode === 0 && !input.squash && previousHead !== currentHead,
    mergedFiles,
    message: mergeMessage ?? (mergeResult.stdout.trim() || mergeResult.stderr.trim()),
    strategy: input.strategy ?? "ort",
  };
}
// 49. Run git pull ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitPull(input: GitArgsMap["git_pull"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const previousHead = await getHeadCommit(cwd);
  const remote = input.remote ?? "origin";
  const branch = input.branch ?? (await getCurrentBranch(cwd)) ?? "HEAD";
  const pullResult = await runGitCommand(["pull", remote, ...(input.branch ? [input.branch] : []), ...(input.fastForwardOnly ? ["--ff-only"] : []), ...(input.rebase ? ["--rebase"] : [])], { cwd, allowFailure: true });
  const currentHead = await getHeadCommit(cwd);
  const conflictedFiles = await getConflictedFiles(cwd);
  const filesChanged = previousHead && currentHead && previousHead !== currentHead ? await getChangedFilesBetween(cwd, previousHead, currentHead) : [];

  return {
    success: pullResult.exitCode === 0,
    remote,
    branch,
    strategy:
      input.fastForwardOnly ? "fast-forward" : input.rebase ? "rebase" : "merge",
    conflicts: conflictedFiles.length > 0,
    conflictedFiles,
    filesChanged,
  };
}
// 50. Run git push ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitPush(input: GitArgsMap["git_push"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const branch = input.branch ?? (await getCurrentBranch(cwd)) ?? "HEAD";
  const remoteBranch = input.remoteBranch ?? branch;
  const remote = input.remote ?? "origin";

  if ((input.force || input.delete) && isProtectedBranch(remoteBranch)) {
    if (input.confirmed !== true) {
    	throw new Error("Force push or branch deletion requires confirmed: true on protected branches.");
    }
  }
  const pushResult = await runGitCommand(["push", remote, ...(input.delete ? ["--delete", remoteBranch] : [`${branch}:${remoteBranch}`]), ...(input.dryRun ? ["--dry-run"] : []), ...(input.force ? ["--force"] : []), ...(input.forceWithLease ? ["--force-with-lease"] : []), ...(input.setUpstream ? ["--set-upstream"] : []), ...(input.tags ? ["--tags"] : [])], { cwd, allowFailure: true });

  return {
    success: pushResult.exitCode === 0,
    remote,
    branch,
    pushedRefs: pushResult.exitCode === 0 ? [remoteBranch] : [],
    rejectedRefs: splitLines(pushResult.stderr).filter((line) => PUSH_REJECTED_REF_PATTERN.test(line)),
    upstreamSet: input.setUpstream === true,
  };
}
// 51. Run git rebase ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitRebase(input: GitArgsMap["git_rebase"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "start";
  let rebaseArgs = ["rebase"];
  let rebasedCommits = 0;

  if (mode === "abort") {
  	rebaseArgs = [...rebaseArgs, "--abort"];
  }
  else if (mode === "continue") {
  	rebaseArgs = [...rebaseArgs, "--continue"];
  }
  else if (mode === "skip") {
  	rebaseArgs = [...rebaseArgs, "--skip"];
  }
  else {
    if (!input.upstream) {
    	throw new Error("upstream is required when mode is start.");
    }
    if (input.branch) {
      const countResult = await runGitCommand(["rev-list", "--count", `${input.upstream}..${input.branch}`], { cwd, allowFailure: true });
      rebasedCommits = Number.parseInt(countResult.stdout.trim() || "0", 10);
    }
    rebaseArgs = [...rebaseArgs, ...(input.interactive ? ["--interactive"] : []), ...(input.preserve ? ["--rebase-merges"] : []), ...(input.onto ? ["--onto", input.onto] : []), input.upstream, ...(input.branch ? [input.branch] : [])];
  }
  const rebaseResult = await runGitCommand(rebaseArgs, { cwd, allowFailure: true });
  const conflictedFiles = await getConflictedFiles(cwd);

  return {
    success: rebaseResult.exitCode === 0,
    conflicts: conflictedFiles.length > 0,
    conflictedFiles,
    rebasedCommits,
    ...(conflictedFiles.length > 0 ? { currentCommit: await getHeadCommit(cwd) } : {}),
    ...(rebaseResult.exitCode !== 0 ? { message: rebaseResult.stderr.trim() || rebaseResult.stdout.trim() } : {}),
  };
}
// 52. Run git reflog ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitReflog(input: GitArgsMap["git_reflog"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const ref = input.ref ?? "HEAD";
  const maxCount = input.maxCount ?? 20;
  const reflogResult = await runGitCommand(["reflog", "show", ref, `--max-count=${String(maxCount)}`, `--format=${REFLOG_FORMAT}`], { cwd, allowFailure: true });
  const entries = splitLines(reflogResult.stdout).map((line) => {
    const parts = line.split("\x1f");
    return {
      refName: parts[0],
      hash: parts[1],
      action: parts[2].split(":")[0],
      message: parts[2],
      timestamp: Number.parseInt(parts[3], 10),
    };
  });

  return {
    success: true,
    ref,
    entries,
    totalEntries: entries.length,
  };
}
// 53. Run git remote ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitRemote(input: GitArgsMap["git_remote"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "list";

  if (mode === "list") {
    return { success: true, mode, remotes: await getRemotes(cwd) };
  }
  if (mode === "add") {
    if (!input.name || !input.url) {
    	throw new Error("name and url are required for add mode.");
    }
    await runGitCommand(["remote", "add", input.name, input.url], { cwd });
    return { success: true, mode, added: { name: input.name, url: input.url } };
  }
  if (mode === "remove") {
    if (!input.name) {
    	throw new Error("name is required for remove mode.");
    }
    await runGitCommand(["remote", "remove", input.name], { cwd });
    return { success: true, mode, removed: input.name };
  }
  if (mode === "rename") {
    if (!input.name || !input.newName) {
    	throw new Error("name and newName are required for rename mode.");
    }
    await runGitCommand(["remote", "rename", input.name, input.newName], { cwd });
    return { success: true, mode, renamed: { from: input.name, to: input.newName } };
  }
  if (mode === "get-url") {
    if (!input.name) {
    	throw new Error("name is required for get-url mode.");
    }
    const urlResult = await runGitCommand(["remote", "get-url", ...(input.push ? ["--push"] : []), input.name], { cwd });
    return { success: true, mode, url: urlResult.stdout.trim() };
  }
  if (!input.name || !input.url) {
  	throw new Error("name and url are required for set-url mode.");
  }
  await runGitCommand(["remote", "set-url", ...(input.push ? ["--push"] : []), input.name, input.url], { cwd });
  return { success: true, mode, url: input.url };
}
// 54. Run git reset ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitReset(input: GitArgsMap["git_reset"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "mixed";
  const previousCommit = await getHeadCommit(cwd);

  if (mode === "hard" || mode === "merge" || mode === "keep") {
  	await ensureProtectedBranchConfirmation(cwd, input.confirmed, "Reset");
  }
  if (input.paths && input.paths.length > 0) {
    await runGitCommand(["reset", ...(input.target ? [input.target] : []), "--", ...input.paths], { cwd });
    return {
      success: true,
      mode,
      target: input.target ?? previousCommit ?? "HEAD",
      filesReset: input.paths,
    };
  }
  const target = input.target ?? "HEAD";
  await runGitCommand(["reset", `--${mode}`, target], { cwd });
  const currentHead = (await getHeadCommit(cwd)) ?? target;
  const filesReset = previousCommit && previousCommit !== currentHead ? await getChangedFilesBetween(cwd, previousCommit, currentHead) : [];

  return {
    success: true,
    mode,
    target: currentHead,
    ...(previousCommit ? { previousCommit } : {}),
    filesReset,
  };
}
// 55. Run git stash ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitStash(input: GitArgsMap["git_stash"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "push";

  if (mode === "list") {
    const listResult = await runGitCommand(["stash", "list", ...(input.limit ? [`--max-count=${String(input.limit)}`] : []), `--format=${STASH_LIST_FORMAT}`], { cwd, allowFailure: true });
    const stashes = splitLines(listResult.stdout).map((line) => {
      const parts = line.split("\x1f");
      const ref = parts[0];
      const indexMatch = ref.match(STASH_INDEX_PATTERN);

      return {
        ref,
        index: Number.parseInt(indexMatch?.[1] ?? "0", 10),
        description: parts[2],
        timestamp: Number.parseInt(parts[1], 10),
        branch: parts[2].includes(":") ? parts[2].split(":")[0].replace(STASH_BRANCH_PREFIX_PATTERN, "") : "unknown",
      };
    });

    return { success: true, mode, stashes };
  }
  if (mode === "clear") {
    await runGitCommand(["stash", "clear"], { cwd });
    return { success: true, mode };
  }
  if (mode === "drop") {
    const stashRef = input.stashRef ?? "stash@{0}";
    await runGitCommand(["stash", "drop", stashRef], { cwd });
    return { success: true, mode, dropped: stashRef };
  }
  if (mode === "apply" || mode === "pop") {
    const stashRef = input.stashRef ?? "stash@{0}";
    const applyResult = await runGitCommand(["stash", mode, stashRef], { cwd, allowFailure: true });
    const conflictedFiles = await getConflictedFiles(cwd);

    return {
      success: applyResult.exitCode === 0,
      mode,
      applied: stashRef,
      conflicts: conflictedFiles.length > 0,
    };
  }
  const stashMessage = await resolveGitTextArgument(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  const pushResult = await runGitCommand(["stash", "push", ...(input.includeUntracked ? ["--include-untracked"] : []), ...(input.keepIndex ? ["--keep-index"] : []), ...(stashMessage ? ["-m", stashMessage] : [])], { cwd });
  const createdMatch = pushResult.stdout.match(STASH_CREATED_PATTERN);

  return {
    success: true,
    mode,
    ...(createdMatch ? { created: createdMatch[0] } : {}),
  };
}
// 56. Run git tag ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitTag(input: GitArgsMap["git_tag"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "list";

  if (mode === "list") {
    const tagResult = await runGitCommand(["for-each-ref", "refs/tags", ...(input.limit ? [`--count=${String(input.limit)}`] : []), "--sort=-creatordate", `--format=${TAG_LIST_FORMAT}`], { cwd, allowFailure: true });
    const tags = splitLines(tagResult.stdout).map((line) => {
      const parts = line.split("\x1f");
      return {
        name: parts[0],
        commit: parts[1],
        ...(parts[2] ? { timestamp: Number.parseInt(parts[2], 10) } : {}),
        ...(parts[3] ? { tagger: parts[3] + (parts[4] ? ` <${parts[4]}>` : "") } : {}),
        ...(parts[5] ? { message: parts[5] } : {}),
        ...(parts[6] ? { annotationBody: parts[6] } : {}),
      };
    });

    return { success: true, mode, tags };
  }
  if (mode === "delete") {
    if (!input.tagName) {
    	throw new Error("tagName is required for delete mode.");
    }
    await runGitCommand(["tag", "-d", input.tagName], { cwd });
    return { success: true, mode, deleted: input.tagName };
  }
  if (mode === "verify") {
    if (!input.tagName) {
    	throw new Error("tagName is required for verify mode.");
    }
    const verifyResult = await runGitCommand(["tag", "-v", input.tagName], { cwd, allowFailure: true });
    const rawOutput = [verifyResult.stdout, verifyResult.stderr].filter((value) => value.length > 0).join("\n");

    return {
      success: true,
      mode,
      verifiedTag: input.tagName,
      verified: verifyResult.exitCode === 0,
      ...(rawOutput.length > 0 ? { rawOutput } : {}),
      ...(verifyResult.exitCode !== 0 ? { warning: rawOutput || "Tag verification failed." } : {}),
    };
  }
  if (!input.tagName) {
  	throw new Error("tagName is required for create mode.");
  }
  const tagMessage = await resolveGitTextArgument(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  await runGitCommand(["tag", ...(input.force ? ["--force"] : []), ...(tagMessage || input.annotated ? ["-a"] : []), ...(tagMessage ? ["-m", tagMessage] : []), input.tagName, ...(input.commit ? [input.commit] : [])], { cwd });

  return {
    success: true,
    mode,
    created: input.tagName,
    signed: false,
  };
}
// 57. Run git worktree ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitWorktree(input: GitArgsMap["git_worktree"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "list";

  if (mode === "list") {
    const listResult = await runGitCommand(["worktree", "list", "--porcelain"], { cwd, allowFailure: true });
    const blocks = listResult.stdout
      .split(WORKTREE_BLOCK_SPLIT_PATTERN)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const worktrees = blocks.map((block) => {
      const values = Object.fromEntries(
        splitLines(block).map((line) => {
          const separatorIndex = line.indexOf(" ");
          return separatorIndex === -1 ? [line, "true"] : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
        }),
      );

      return {
        path: values.worktree,
        head: values.HEAD,
        branch: values.branch ? values.branch.replace("refs/heads/", "") : undefined,
        detached: values.detached === "true",
        bare: values.bare === "true",
        locked: Object.hasOwn(values, "locked"),
        prunable: Object.hasOwn(values, "prunable"),
      };
    });

    return { success: true, mode, worktrees };
  }
  if (mode === "add") {
    if (!input.worktreePath) {
    	throw new Error("worktreePath is required for add mode.");
    }
    const worktreePath = await resolveCreationPath(input.worktreePath);

    await ensureDirectoryExists(path.dirname(worktreePath));
    await runGitCommand(["worktree", "add", ...(input.detach ? ["--detach"] : []), ...(input.branch ? ["-b", input.branch] : []), worktreePath, ...(input.commitish ? [input.commitish] : [])], { cwd });

    return { success: true, mode, added: worktreePath };
  }
  if (mode === "remove") {
    if (!input.worktreePath) {
    	throw new Error("worktreePath is required for remove mode.");
    }
    await runGitCommand(["worktree", "remove", ...(input.force ? ["--force"] : []), input.worktreePath], { cwd });
    return { success: true, mode, removed: input.worktreePath };
  }
  if (mode === "move") {
    if (!input.worktreePath || !input.newPath) {
    	throw new Error("worktreePath and newPath are required for move mode.");
    }
    await runGitCommand(["worktree", "move", input.worktreePath, input.newPath], { cwd });
    return { success: true, mode, moved: { from: input.worktreePath, to: input.newPath } };
  }
  const pruneResult = await runGitCommand(["worktree", "prune", ...(input.dryRun ? ["--dry-run"] : []), ...(input.verbose ? ["--verbose"] : [])], { cwd, allowFailure: true });

  return {
    success: pruneResult.exitCode === 0,
    mode,
    pruned: splitLines(pruneResult.stdout),
  };
}
// 58. Run git blame ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitBlame(input: GitArgsMap["git_blame"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const blameResult = await runGitCommand(["blame", "--line-porcelain", ...(input.ignoreWhitespace ? ["-w"] : []), ...(input.startLine && input.endLine ? ["-L", `${String(input.startLine)},${String(input.endLine)}`] : []), input.filePath], { cwd });
  const lines: Record<string, unknown>[] = [];
  let currentHash = "";
  let currentAuthor = "unknown";
  let currentTimestamp = 0;
  let currentLineNumber = 0;

  splitLines(blameResult.stdout).forEach((line) => {
    if (BLAME_HEADER_PATTERN.test(line)) {
    	const parts = line.split(" ");
      currentHash = parts[0];
      currentLineNumber = Number.parseInt(parts[2], 10);
    }
    else if (line.startsWith("author ")) {
    	currentAuthor = line.slice(7);
    }
    else if (line.startsWith("author-time ")) {
    	currentTimestamp = Number.parseInt(line.slice(12), 10);
    }
    else if (line.startsWith("\t")) {
      lines.push({
        commitHash: currentHash,
        author: currentAuthor,
        timestamp: currentTimestamp,
        lineNumber: currentLineNumber,
        content: line.slice(1),
      });
    }
  });

  return {
    success: true,
    filePath: input.filePath,
    lines,
    totalLines: lines.length,
  };
}
// 59. Run git changelog analyze ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitChangelogAnalyze(input: GitArgsMap["git_changelog_analyze"]): Promise<Record<string, unknown>> {
  const cwd = await resolveRepositoryPath(input.path);
  const branch = input.branch ?? (await getCurrentBranch(cwd)) ?? "HEAD";
  const maxCommits = input.maxCommits ?? 20;
  const maxTags = input.maxTags ?? 20;
  const historyRange = input.sinceTag ? `${input.sinceTag}..${branch}` : branch;
  const commitResult = await runGitCommand(["log", historyRange, `--max-count=${String(maxCommits)}`, `--pretty=format:${CHANGELOG_COMMIT_FORMAT}`], { cwd, allowFailure: true });
  const commits = commitResult.stdout
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split("\x1f");
      return {
        hash: parts[0],
        author: parts[1],
        timestamp: Number.parseInt(parts[2], 10),
        ...(parseRefs(parts[3]) ? { refs: parseRefs(parts[3]) } : {}),
        subject: parts[4],
      };
    });
  const tags = await getRecentTags(cwd, maxTags);
  const reviewInstructions = input.reviewTypes.map((reviewType) => `[${reviewType}] review recent commits and tag context for that dimension.`).join("\n");

  return {
    success: true,
    reviewTypes: input.reviewTypes,
    reviewInstructions,
    gitContext: {
      currentBranch: branch,
      commits,
      tags,
      totalCommitsFetched: commits.length,
    },
  };
}
// 60. Run git wrapup instructions ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
async function runGitWrapupInstructions(input: GitArgsMap["git_wrapup_instructions"]): Promise<Record<string, unknown>> {
  const createTag = input.createTag ?? true;
  const instructions = ["Acceptance criteria:", "1. Inspect git diff and understand each change before grouping commits.", "2. Update changelog or release metadata when this repository requires it.", "3. Run the smallest real verification set for the changed surface.", "4. Create atomic Conventional Commit messages only after verification passes.", "5. Confirm the working tree is clean after commits.", ...(createTag ? ["6. Create an annotated semantic-version tag only when release tagging is in scope."] : []), "Stop and report if conflicts, unexplained changes, or failing checks remain."].join("\n");
  const repository = currentGitWorkingDirectory ? await gatherRepositorySnapshot(await resolveRepositoryPath(currentGitWorkingDirectory)) : undefined;

  return {
    instructions,
    ...(repository ? { repository } : {}),
  };
}
