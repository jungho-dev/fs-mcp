/**
 * @file src/features/git/git-operations-history.ts
 * @description History and analysis git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { runGitCommand as rnGtCmd, splitLines } from "@features/git/git-runtime";
import { resolveRepositoryPath as rslvRepoPth } from "@features/git/git-session";
import { getRecentTags as gtRcntTgs, parseRefs } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput as GtTlOtpt } from "@features/git/git-types";

const BLM_HDR_PAT = /^[0-9a-f]{40}\\s+\\d+\\s+\\d+/;
const RFLG_FRMT = "%gD%x1f%H%x1f%gs%x1f%ct";
const CHN_CMM_FRM = "%h%x1f%an%x1f%ct%x1f%d%x1f%s%x1e";

// 1. Run git blame --------------------------------------------------------------------------------
export async function runGitBlame(input: GitArgsMap["git_blame"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const blameResult = await rnGtCmd(["blame", "--line-porcelain", ...(input.ignoreWhitespace ? ["-w"] : []), ...(input.startLine && input.endLine ? ["-L", `${String(input.startLine)},${String(input.endLine)}`] : []), input.filePath], { cwd });
  const lines: Record<string, unknown>[] = [];
  let currentHash = "";
  let curAthr = "unknown";
  let curTs2 = 0;
  let curLnNmbr = 0;

  splitLines(blameResult.stdout).forEach((line) => {
    if (BLM_HDR_PAT.test(line)) {
      const parts = line.split(" ");
      currentHash = parts[0];
      curLnNmbr = Number.parseInt(parts[2], 10);
    }
    else if (line.startsWith("author ")) {
      curAthr = line.slice(7);
    }
    else if (line.startsWith("author-time ")) {
      curTs2 = Number.parseInt(line.slice(12), 10);
    }
    else if (line.startsWith("\t")) {
      lines.push({
        commitHash: currentHash,
        author: curAthr,
        timestamp: curTs2,
        lineNumber: curLnNmbr,
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

// 2. Run git reflog -------------------------------------------------------------------------------
export async function runGitReflog(input: GitArgsMap["git_reflog"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const ref = input.ref ?? "HEAD";
  const maxCount = input.maxCount ?? 20;
  const reflogResult = await rnGtCmd(["reflog", "show", ref, `--max-count=${String(maxCount)}`, `--format=${RFLG_FRMT}`], { cwd, allowFailure: true });
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

// 3. Run git changelog analyze --------------------------------------------------------------------
export async function runGitChangelogAnalyze(input: GitArgsMap["git_changelog_analyze"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const branch = input.branch ?? "HEAD";
  const maxCommits = input.maxCommits ?? 20;
  const maxTags = input.maxTags ?? 20;
  const historyRange = input.sinceTag ? `${input.sinceTag}..${branch}` : branch;
  const commitResult = await rnGtCmd(["log", historyRange, `--max-count=${String(maxCommits)}`, `--pretty=format:${CHN_CMM_FRM}`], { cwd, allowFailure: true });
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
  const tags = await gtRcntTgs(cwd, maxTags);
  const rvwInst = input.reviewTypes.map((reviewType) => `[${reviewType}] review recent commits and tag context for that dimension.`).join("\n");

  return {
    success: true,
    reviewTypes: input.reviewTypes,
    reviewInstructions: rvwInst,
    gitContext: {
      currentBranch: branch,
      commits,
      tags,
      totalCommitsFetched: commits.length,
    },
  };
}
