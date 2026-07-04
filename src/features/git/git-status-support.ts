/**
 * @file src/features/git/git-status-support.ts
 * @description Git status, snapshot, and diff support helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import path from "node:path";
import {CNF_STA_CDS, runGitCommand as rnGtCmd, splitLines} from "@features/git/git-runtime";
import type {GitStatusBucket as GtStatBckt, GitStatusSummary as GtStatSmmr, GitWorkingTreeBucket as GtWrknTrBckt} from "@features/git/git-types";

export const GRFS = "\u001f";
export const GRRS = "\u001e";

const BRN_TRC_PAT = /^([^\s]+)(?: \[(.*)\])?$/;
const AHD_PAT = /ahead (\d+)/;
const BHND_PAT = /behind (\d+)/;
const RMT_LN_PAT = /^([^\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/;
const TRRLP = /\r?\n$/;
const WRPP_RFS_PAT = /^\((.*)\)$/;
const RCN_CMM_FRM = "%H%x1f%an%x1f%aI%x1f%s%x1e";
const RCNT_TG_FRMT = `%(refname:short)${GRFS}%(creatordate:iso-strict)${GRFS}%(taggername)${GRFS}%(taggeremail)${GRFS}%(subject)${GRFS}%(body)${GRRS}`;

// 1. Append unique --------------------------------------------------------------------------------
export function appendUnique(target: string[] | undefined, value: string): string[] {
  const normTgt2 = target ?? [];

  if (!normTgt2.includes(value)) {
    normTgt2.push(value);
  }

  return normTgt2;
}

// 2. Add index change -----------------------------------------------------------------------------
export function addIndexChange(bucket: GtStatBckt, code: string, pathValue: string): void {
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

// 3. Add working tree change ----------------------------------------------------------------------
export function addWorkingTreeChange(bucket: GtWrknTrBckt, code: string, pathValue: string): void {
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

// 4. Flatten bucket -------------------------------------------------------------------------------
export function flattenBucket(bucket: GtStatBckt | GtWrknTrBckt): string[] {
  const flttVals = Object.values(bucket).flatMap((value) => value ?? []);
  return flttVals;
}

// 5. Parse branch header --------------------------------------------------------------------------
export function parseBranchHeader(line: string, summary: GtStatSmmr): void {
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
      const trackMatch = pieces[1].match(BRN_TRC_PAT);

      if (trackMatch) {
        summary.upstream = trackMatch[1];
        if (trackMatch[2]) {
          const aheadMatch = trackMatch[2].match(AHD_PAT);
          const behindMatch = trackMatch[2].match(BHND_PAT);

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

// 6. Parse status summary -------------------------------------------------------------------------
export function parseStatusSummary(text: string, incUntr: boolean): GtStatSmmr {
  const summary: GtStatSmmr = {
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

      if (CNF_STA_CDS.has(indexCode + worktreeCode)) {
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

  summary.isClean = incUntr ? trackedClean && summary.untrackedFiles.length === 0 : trackedClean;

  return summary;
}

// 7. Get status summary ---------------------------------------------------------------------------
export async function getStatusSummary(cwd: string, incUntr: boolean = true): Promise<GtStatSmmr> {
  const statusArgs = ["status", "--short", "--branch", incUntr ? "--untracked-files=all" : "--untracked-files=no"];
  const cmdRes = await rnGtCmd(statusArgs, { cwd });
  return parseStatusSummary(cmdRes.stdout, incUntr);
}

// 8. To snake status ------------------------------------------------------------------------------
export function toSnakeStatus(summary: GtStatSmmr): Record<string, unknown> {
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

// 9. To snapshot status ---------------------------------------------------------------------------
export function toSnapshotStatus(summary: GtStatSmmr): Record<string, unknown> {
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

// 10. Get remotes ---------------------------------------------------------------------------------
export async function getRemotes(cwd: string): Promise<Record<string, string>[]> {
  const cmdRes = await rnGtCmd(["remote", "-v"], { cwd, allowFailure: true });
  const remoteMap = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>();

  splitLines(cmdRes.stdout).forEach((line) => {
    const match = line.match(RMT_LN_PAT);

    if (match) {
      const remoteName = match[1];
      const remoteUrl = match[2];
      const remoteMode = match[3];
      const curRmt = remoteMap.get(remoteName) ?? { name: remoteName, fetchUrl: "", pushUrl: "" };

      if (remoteMode === "fetch") {
        curRmt.fetchUrl = remoteUrl;
      }
      else {
        curRmt.pushUrl = remoteUrl;
      }

      remoteMap.set(remoteName, curRmt);
    }
  });

  return [...remoteMap.values()];
}

// 11. Get recent commits --------------------------------------------------------------------------
export async function getRecentCommits(cwd: string, limit: number): Promise<Record<string, string>[]> {
  const cmdRes = await rnGtCmd(["log", `--max-count=${String(limit)}`, `--pretty=format:${RCN_CMM_FRM}`], { cwd, allowFailure: true });

  if (cmdRes.exitCode !== 0) {
    return [];
  }

  return cmdRes.stdout
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

// 12. Get recent tags -----------------------------------------------------------------------------
export async function getRecentTags(cwd: string, limit: number): Promise<Record<string, string>[]> {
  const cmdRes = await rnGtCmd([
    "for-each-ref",
    "refs/tags",
    "--sort=-creatordate",
    `--count=${String(limit)}`,
    `--format=${RCNT_TG_FRMT}`,
  ], { cwd, allowFailure: true });

  if (cmdRes.exitCode !== 0) {
    return [];
  }

  return cmdRes.stdout
    .split(GRRS)
    .map((entry) => entry.replace(TRRLP, ""))
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const parts = entry.split(GRFS);
      const taggerName = parts[2] ?? "";
      const taggerEmail = parts[3] ?? "";
      const anntBdy = parts[5] ?? "";
      const tagger = taggerName ? `${taggerName}${taggerEmail ? ` <${taggerEmail}>` : ""}` : "";

      return {
        name: parts[0],
        ...(parts[1] ? { date: parts[1] } : {}),
        ...(tagger ? { tagger } : {}),
        ...(parts[4] ? { annotationSubject: parts[4] } : {}),
        ...(anntBdy ? { annotationBody: anntBdy } : {}),
      };
    });
}

// 13. Gather repository snapshot ------------------------------------------------------------------
export async function gatherRepositorySnapshot(cwd: string): Promise<Record<string, unknown>> {
  const [status, rcntCmmt, recentTags, remotes] = await Promise.all([
    getStatusSummary(cwd, true),
    getRecentCommits(cwd, 2),
    getRecentTags(cwd, 2),
    getRemotes(cwd),
  ]);

  return {
    status: toSnapshotStatus(status),
    recentCommits: rcntCmmt,
    recentTags,
    remotes,
  };
}

// 14. Get changed files between -------------------------------------------------------------------
export async function getChangedFilesBetween(cwd: string, left: string, right: string): Promise<string[]> {
  const cmdRes = await rnGtCmd(["diff", "--name-only", left, right], { cwd, allowFailure: true });
  return splitLines(cmdRes.stdout);
}

// 15. Get conflicted files ------------------------------------------------------------------------
export async function getConflictedFiles(cwd: string): Promise<string[]> {
  const status = await getStatusSummary(cwd, true);
  return status.conflictedFiles;
}

// 16. Sum numstat ---------------------------------------------------------------------------------
export function sumNumstat(text: string): { filesChanged: number; insertions?: number; deletions?: number } {
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

// 17. Parse refs ----------------------------------------------------------------------------------
export function parseRefs(refText: string | undefined): string[] | undefined {
  if (!refText) {
    return undefined;
  }

  const normalized = refText.trim();

  if (!normalized || normalized === "()") {
    return undefined;
  }

  const refs = normalized.replace(WRPP_RFS_PAT, "$1").split(",").map((value) => value.trim()).filter((value) => value.length > 0);
  return refs.length > 0 ? refs : undefined;
}

// 18. Detect auto excluded files ------------------------------------------------------------------
export function detectAutoExcludedFiles(paths: string[], patterns: readonly string[]): string[] {
  const exclFls = paths.filter((filePath) => patterns.includes(path.basename(filePath)));
  return exclFls;
}
