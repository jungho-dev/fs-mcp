/**
 * @file src/features/git/git-operations-remotes.ts
 * @description Remote git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { runGitCommand as rnGtCmd, splitLines } from "@features/git/git-runtime";
import { getCurrentBranch as gtCurBrnc, getHeadCommit as gtHdCmmt, isProtectedBranch as isPrtcBrnc, resolveRepositoryPath as rslvRepoPth } from "@features/git/git-session";
import { getChangedFilesBetween as gtChFlBt, getConflictedFiles as gtCnflFls, getRemotes } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput as GtTlOtpt } from "@features/git/git-types";

const FPRP = /prune|deleted/i;
const PRRP = /\\[rejected\\]/i;

// 1. Run git fetch --------------------------------------------------------------------------------
export async function runGitFetch(input: GitArgsMap["git_fetch"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const remote = input.remote ?? "origin";
  const fetchResult = await rnGtCmd(["fetch", remote, ...(input.depth ? [`--depth=${String(input.depth)}`] : []), ...(input.prune ? ["--prune"] : []), ...(input.tags ? ["--tags"] : [])], { cwd });

  return {
    success: true,
    remote,
    fetchedRefs: splitLines(fetchResult.stderr).filter((line) => line.includes("->")),
    prunedRefs: splitLines(fetchResult.stderr).filter((line) => FPRP.test(line)),
  };
}

// 2. Run git pull ---------------------------------------------------------------------------------
export async function runGitPull(input: GitArgsMap["git_pull"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const previousHead = await gtHdCmmt(cwd);
  const remote = input.remote ?? "origin";
  const branch = input.branch ?? (await gtCurBrnc(cwd)) ?? "HEAD";
  const pullResult = await rnGtCmd(["pull", remote, ...(input.branch ? [input.branch] : []), ...(input.fastForwardOnly ? ["--ff-only"] : []), ...(input.rebase ? ["--rebase"] : [])], { cwd, allowFailure: true });
  const currentHead = await gtHdCmmt(cwd);
  const cnflFls = await gtCnflFls(cwd);
  const filesChanged = previousHead && currentHead && previousHead !== currentHead ? await gtChFlBt(cwd, previousHead, currentHead) : [];

  return {
    success: pullResult.exitCode === 0,
    remote,
    branch,
    strategy:
      input.fastForwardOnly ? "fast-forward" : input.rebase ? "rebase" : "merge",
    conflicts: cnflFls.length > 0,
    conflictedFiles: cnflFls,
    filesChanged,
  };
}

// 3. Run git push ---------------------------------------------------------------------------------
export async function runGitPush(input: GitArgsMap["git_push"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const branch = input.branch ?? (await gtCurBrnc(cwd)) ?? "HEAD";
  const remoteBranch = input.remoteBranch ?? branch;
  const remote = input.remote ?? "origin";

  if ((input.force || input.delete) && isPrtcBrnc(remoteBranch)) {
    if (input.confirmed !== true) {
      throw new Error("Force push or branch deletion requires confirmed: true on protected branches.");
    }
  }
  const pushResult = await rnGtCmd(["push", remote, ...(input.delete ? ["--delete", remoteBranch] : [`${branch}:${remoteBranch}`]), ...(input.dryRun ? ["--dry-run"] : []), ...(input.force ? ["--force"] : []), ...(input.forceWithLease ? ["--force-with-lease"] : []), ...(input.setUpstream ? ["--set-upstream"] : []), ...(input.tags ? ["--tags"] : [])], { cwd, allowFailure: true });

  return {
    success: pushResult.exitCode === 0,
    remote,
    branch,
    pushedRefs: pushResult.exitCode === 0 ? [remoteBranch] : [],
    rejectedRefs: splitLines(pushResult.stderr).filter((line) => PRRP.test(line)),
    upstreamSet: input.setUpstream === true,
  };
}

// 4. Run git remote -------------------------------------------------------------------------------
export async function runGitRemote(input: GitArgsMap["git_remote"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const mode = input.mode ?? "list";

  if (mode === "list") {
    return { success: true, mode, remotes: await getRemotes(cwd) };
  }
  if (mode === "add") {
    if (!input.name || !input.url) {
      throw new Error("name and url are required for add mode.");
    }
    await rnGtCmd(["remote", "add", input.name, input.url], { cwd });
    return { success: true, mode, added: { name: input.name, url: input.url } };
  }
  if (mode === "remove") {
    if (!input.name) {
      throw new Error("name is required for remove mode.");
    }
    await rnGtCmd(["remote", "remove", input.name], { cwd });
    return { success: true, mode, removed: input.name };
  }
  if (mode === "rename") {
    if (!input.name || !input.newName) {
      throw new Error("name and newName are required for rename mode.");
    }
    await rnGtCmd(["remote", "rename", input.name, input.newName], { cwd });
    return { success: true, mode, renamed: { from: input.name, to: input.newName } };
  }
  if (mode === "get-url") {
    if (!input.name) {
      throw new Error("name is required for get-url mode.");
    }
    const urlResult = await rnGtCmd(["remote", "get-url", ...(input.push ? ["--push"] : []), input.name], { cwd });
    return { success: true, mode, url: urlResult.stdout.trim() };
  }
  if (!input.name || !input.url) {
    throw new Error("name and url are required for set-url mode.");
  }
  await rnGtCmd(["remote", "set-url", ...(input.push ? ["--push"] : []), input.name, input.url], { cwd });
  return { success: true, mode, url: input.url };
}