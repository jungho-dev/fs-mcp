/**
 * @file src/features/git/git-status-support.ts
 * @description Git status, snapshot, and diff support helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import path from "node:path";
import {CONFLICT_STATUS_CODES, runGitCommand, splitLines} from "@features/git/git-runtime";
import type {GitStatusBucket, GitStatusSummary, GitWorkingTreeBucket} from "@features/git/git-types";

export const GIT_REF_FIELD_SEPARATOR = "\\u001f";
export const GIT_REF_RECORD_SEPARATOR = "\\u001e";

// 1. unique append ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function appendUnique(target: string[] | undefined, value: string): string[] {
  const normalizedTarget = target ?? [];

  if (!normalizedTarget.includes(value)) {
    normalizedTarget.push(value);
  }

  return normalizedTarget;
}

// 2. index change add ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function addIndexChange(bucket: GitStatusBucket, code: string, pathValue: string): void {
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

// 3. worktree change add ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function addWorkingTreeChange(bucket: GitWorkingTreeBucket, code: string, pathValue: string): void {
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

// 4. bucket flatten ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function flattenBucket(bucket: GitStatusBucket | GitWorkingTreeBucket): string[] {
  const flattenedValues = Object.values(bucket).flatMap((value) => value ?? []);
  return flattenedValues;
}

// 5. branch header parse ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function parseBranchHeader(line: string, summary: GitStatusSummary): void {
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
      const trackMatch = pieces[1].match(/^([^\\s]+)(?: \\[(.*)\\])?$/);

      if (trackMatch) {
        summary.upstream = trackMatch[1];
        if (trackMatch[2]) {
          const aheadMatch = trackMatch[2].match(/ahead (\\d+)/);
          const behindMatch = trackMatch[2].match(/behind (\\d+)/);

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

// 6. status summary parse ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function parseStatusSummary(text: string, includeUntracked: boolean): GitStatusSummary {
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

  const trackedClean = flattenBucket(summary.stagedChanges).length === 0 &&
    flattenBucket(summary.unstagedChanges).length === 0 &&
    summary.conflictedFiles.length === 0;

  summary.isClean = includeUntracked ? trackedClean && summary.untrackedFiles.length === 0 : trackedClean;

  return summary;
}

// 7. status summary load ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getStatusSummary(cwd: string, includeUntracked: boolean = true): Promise<GitStatusSummary> {
  const statusArgs = ["status", "--short", "--branch", includeUntracked ? "--untracked-files=all" : "--untracked-files=no"];
  const commandResult = await runGitCommand(statusArgs, { cwd });
  return parseStatusSummary(commandResult.stdout, includeUntracked);
}

// 8. snake status format ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function toSnakeStatus(summary: GitStatusSummary): Record<string, unknown> {
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

// 9. snapshot status format ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function toSnapshotStatus(summary: GitStatusSummary): Record<string, unknown> {
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

// 10. remotes load ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getRemotes(cwd: string): Promise<Array<Record<string, string>>> {
  const commandResult = await runGitCommand(["remote", "-v"], { cwd, allowFailure: true });
  const remoteMap = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>();

  splitLines(commandResult.stdout).forEach((line) => {
    const match = line.match(/^([^\\s]+)\\s+([^\\s]+)\\s+\\((fetch|push)\\)$/);

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

// 11. recent commits load ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getRecentCommits(cwd: string, limit: number): Promise<Array<Record<string, string>>> {
  const commandResult = await runGitCommand(["log", "--max-count=" + String(limit), "--pretty=format:%H%x1f%an%x1f%aI%x1f%s%x1e"], { cwd, allowFailure: true });

  if (commandResult.exitCode !== 0) {
    return [];
  }

  return commandResult.stdout
    .split("\\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split("\\x1f");
      return {
        hash: parts[0],
        author: parts[1],
        date: parts[2],
        subject: parts[3],
      };
    });
}

// 12. recent tags load ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getRecentTags(cwd: string, limit: number): Promise<Array<Record<string, string>>> {
  const commandResult = await runGitCommand([
    "for-each-ref",
    "refs/tags",
    "--sort=-creatordate",
    "--count=" + String(limit),
    `--format=%(refname:short)${GIT_REF_FIELD_SEPARATOR}%(creatordate:iso-strict)${GIT_REF_FIELD_SEPARATOR}%(taggername)${GIT_REF_FIELD_SEPARATOR}%(taggeremail)${GIT_REF_FIELD_SEPARATOR}%(subject)${GIT_REF_FIELD_SEPARATOR}%(body)${GIT_REF_RECORD_SEPARATOR}`,
  ], { cwd, allowFailure: true });

  if (commandResult.exitCode !== 0) {
    return [];
  }

  return commandResult.stdout
    .split(GIT_REF_RECORD_SEPARATOR)
    .map((entry) => entry.replace(/\\r?\\n$/, ""))
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split(GIT_REF_FIELD_SEPARATOR);
      const taggerName = parts[2] ?? "";
      const taggerEmail = parts[3] ?? "";
      const annotationBody = parts[5] ?? "";
      const tagger = taggerName ? `${taggerName}${taggerEmail ? ` <${taggerEmail}>` : ""}` : "";

      return {
        name: parts[0],
        ...(parts[1] ? { date: parts[1] } : {}),
        ...(tagger ? { tagger } : {}),
        ...(parts[4] ? { annotationSubject: parts[4] } : {}),
        ...(annotationBody ? { annotationBody } : {}),
      };
    });
}

// 13. repository snapshot gather ――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function gatherRepositorySnapshot(cwd: string): Promise<Record<string, unknown>> {
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

// 14. changed files between ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getChangedFilesBetween(cwd: string, left: string, right: string): Promise<string[]> {
  const commandResult = await runGitCommand(["diff", "--name-only", left, right], { cwd, allowFailure: true });
  return splitLines(commandResult.stdout);
}

// 15. conflicted files load ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getConflictedFiles(cwd: string): Promise<string[]> {
  const status = await getStatusSummary(cwd, true);
  return status.conflictedFiles;
}

// 16. numstat sum ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function sumNumstat(text: string): { filesChanged: number; insertions?: number; deletions?: number } {
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  splitLines(text).forEach((line) => {
    const parts = line.split("\\t");
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

// 17. refs parse ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function parseRefs(refText: string | undefined): string[] | undefined {
  if (!refText) {
    return undefined;
  }

  const normalized = refText.trim();

  if (!normalized || normalized === "()") {
    return undefined;
  }

  const refs = normalized.replace(/^\\((.*)\\)$/, "$1").split(",").map((value) => value.trim()).filter((value) => value.length > 0);
  return refs.length > 0 ? refs : undefined;
}

// 18. auto-excluded files detect ―――――――――――――――――――――――――――――――――――――――――――――――――――――
export function detectAutoExcludedFiles(paths: string[], patterns: readonly string[]): string[] {
  const excludedFiles = paths.filter((filePath) => patterns.includes(path.basename(filePath)));
  return excludedFiles;
}
