/**
 * @file src/features/git/git-operations-branches.ts
 * @description Branching and advanced workflow git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import path from "node:path";
import { resolveGitTextArgument, runGitCommand, splitLines } from "@features/git/git-runtime";
import { ensureDirectoryExists, ensureProtectedBranchConfirmation, getCurrentBranch, getHeadCommit, resolveCreationPath, resolveRepositoryPath } from "@features/git/git-session";
import { getChangedFilesBetween, getConflictedFiles, getRecentTags } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput } from "@features/git/git-types";

const CLEAN_REMOVED_PATTERN = /(?:Would remove|Removing)\s+(.+)$/;
const TRAILING_PATH_SEPARATOR_PATTERN = /[\\/]+$/;
const AHEAD_PATTERN = /ahead (\d+)/;
const BEHIND_PATTERN = /behind (\d+)/;
const STASH_INDEX_PATTERN = /stash@\{(\d+)\}/;
const STASH_CREATED_PATTERN = /stash@\{\d+\}/;
const STASH_BRANCH_PREFIX_PATTERN = /^On\s+/;
const WORKTREE_BLOCK_SPLIT_PATTERN = /\r?\n\r?\n/;
// biome-ignore lint/security/noSecrets: Git for-each-ref format atoms are not secrets.
const BRANCH_LIST_FORMAT = "%(refname:short)%x1f%(HEAD)%x1f%(objectname)%x1f%(upstream:short)%x1f%(upstream:track)";
const STASH_LIST_FORMAT = "%gd%x1f%ct%x1f%gs";

// 1. Run git clean ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitClean(input: GitArgsMap["git_clean"]): Promise<GitToolOutput> {
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

// 2. Run git branch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitBranch(input: GitArgsMap["git_branch"]): Promise<GitToolOutput> {
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

// 3. Run git checkout ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitCheckout(input: GitArgsMap["git_checkout"]): Promise<GitToolOutput> {
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

// 4. Run git cherry pick ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitCherryPick(input: GitArgsMap["git_cherry_pick"]): Promise<GitToolOutput> {
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

// 5. Run git merge ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitMerge(input: GitArgsMap["git_merge"]): Promise<GitToolOutput> {
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

// 6. Run git rebase ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitRebase(input: GitArgsMap["git_rebase"]): Promise<GitToolOutput> {
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

// 7. Run git reset ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitReset(input: GitArgsMap["git_reset"]): Promise<GitToolOutput> {
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

// 8. Run git stash ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitStash(input: GitArgsMap["git_stash"]): Promise<GitToolOutput> {
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

// 9. Run git tag ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitTag(input: GitArgsMap["git_tag"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const mode = input.mode ?? "list";

  if (mode === "list") {
    const tags = await getRecentTags(cwd, input.limit ?? 1000);
    const detailedTags = await Promise.all(
      tags.map(async (tag) => {
        const commitResult = await runGitCommand(["rev-list", "-n", "1", String(tag.name)], { cwd, allowFailure: true });
        const dateValue = typeof tag.date === "string" ? Date.parse(tag.date) : Number.NaN;

        return {
          ...tag,
          commit: commitResult.stdout.trim(),
          ...(Number.isNaN(dateValue) ? {} : { timestamp: Math.floor(dateValue / 1000) }),
        };
      }),
    );

    return { success: true, mode, tags: detailedTags };
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

// 10. Run git worktree ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitWorktree(input: GitArgsMap["git_worktree"]): Promise<GitToolOutput> {
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
