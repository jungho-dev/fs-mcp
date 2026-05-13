/**
 * @file src/features/git/git-operations-history.ts
 * @description History and analysis git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { runGitCommand, splitLines } from "@features/git/git-runtime";
import { resolveRepositoryPath } from "@features/git/git-session";
import { getRecentTags, parseRefs } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput } from "@features/git/git-types";

const BLAME_HEADER_PATTERN = /^[0-9a-f]{40}\\s+\\d+\\s+\\d+/;
const REFLOG_FORMAT = "%gD%x1f%H%x1f%gs%x1f%ct";
const CHANGELOG_COMMIT_FORMAT = "%h%x1f%an%x1f%ct%x1f%d%x1f%s%x1e";

// 1. Run git blame ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitBlame(input: GitArgsMap["git_blame"]): Promise<GitToolOutput> {
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

// 2. Run git reflog ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitReflog(input: GitArgsMap["git_reflog"]): Promise<GitToolOutput> {
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

// 3. Run git changelog analyze ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitChangelogAnalyze(input: GitArgsMap["git_changelog_analyze"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const branch = input.branch ?? "HEAD";
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
