/**
 * @file src/features/git/git-operations-repository.ts
 * @description Repository-scoped git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import path from "node:path";
import { runGitCommand as rnGtCmd } from "@features/git/git-runtime";
import { ensureDirectoryExists as ensrDirExst, getCurrentBranch as gtCurBrnc, getCurrentGitWorkingDirectory as gtCuGtWrDi, getHeadCommit as gtHdCmmt, resolveCreationBasePath as rslCrBsPt, resolveCreationPath as rslvCrtnPth, resolveRepositoryPath as rslvRepoPth, setCurrentGitWorkingDirectory as stCuGtWrDi } from "@features/git/git-session";
import { gatherRepositorySnapshot as gthrRepoSnps, getStatusSummary as gtStatSmmr } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput as GtTlOtpt } from "@features/git/git-types";

// 1. Run git set working dir ----------------------------------------------------------------------
export async function runGitSetWorkingDir(input: GitArgsMap["git-set-workdir"]): Promise<GtTlOtpt> {
  const resolvedPath = await rslvCrtnPth(input.path);
  const shldValRepo = input.validateGitRepo ?? true;
  const shldIntlRepo = input.initializeIfNotPresent ?? false;

  await ensrDirExst(resolvedPath);

  // Initialization runs independently of validation so a fresh directory can be pinned in one call.
  let repoCheck = await rnGtCmd(["rev-parse", "--show-toplevel"], { cwd: resolvedPath, allowFailure: true });
  if (repoCheck.exitCode !== 0 && shldIntlRepo) {
    await rnGtCmd(["init", "--initial-branch=main"], { cwd: resolvedPath });
    repoCheck = await rnGtCmd(["rev-parse", "--show-toplevel"], { cwd: resolvedPath, allowFailure: true });
  }
  if (shldValRepo) {
    if (repoCheck.exitCode !== 0) {
      throw new Error(`Path is not a git repository: ${resolvedPath}. Pass initializeIfNotPresent: true to run git init here.`);
    }
    stCuGtWrDi(repoCheck.stdout.trim());
  }
  else {
    stCuGtWrDi(resolvedPath);
  }
  let repository: Record<string, unknown> | undefined;
  let enrcWrnn: string[] | undefined;
  const curWrknDir = gtCuGtWrDi();

  if (shldValRepo && curWrknDir) {
    try {
      repository = await gthrRepoSnps(curWrknDir);
    }
    catch (error) {
      enrcWrnn = [`Repository snapshot skipped: ${error instanceof Error ? error.message : String(error)}`];
    }
  }
  return {
    success: true,
    path: curWrknDir,
    message: `Working directory set to: ${curWrknDir}`,
    ...(repository ? { repository } : {}),
    ...(enrcWrnn ? { enrichmentWarnings: enrcWrnn } : {}),
  };
}

// 3. Run git status -------------------------------------------------------------------------------
export async function runGitStatus(input: GitArgsMap["git-status"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const incUntr = input.includeUntracked ?? true;
  const status = await gtStatSmmr(cwd, incUntr);

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

// 4. Run git init ---------------------------------------------------------------------------------
export async function runGitInit(input: GitArgsMap["git_init"]): Promise<GtTlOtpt> {
  const targetPath = await rslCrBsPt(input.path);
  const intlBrnc = input.initialBranch ?? "main";

  await ensrDirExst(targetPath);
  await rnGtCmd(["init", `--initial-branch=${intlBrnc}`, ...(input.bare ? ["--bare"] : [])], { cwd: targetPath });

  return {
    success: true,
    path: targetPath,
    initialBranch: intlBrnc,
    isBare: input.bare === true,
  };
}

// 5. Run git clone --------------------------------------------------------------------------------
export async function runGitClone(input: GitArgsMap["git_clone"]): Promise<GtTlOtpt> {
  const dstPth = await rslvCrtnPth(input.path);

  await ensrDirExst(path.dirname(dstPth));
  await rnGtCmd(["clone", ...(input.bare ? ["--bare"] : []), ...(input.mirror ? ["--mirror"] : []), ...(input.branch ? ["--branch", input.branch] : []), ...(input.depth ? [`--depth=${String(input.depth)}`] : []), input.url, dstPth]);

  const headCommit = await gtHdCmmt(dstPth);
  const curBrnc2 = await gtCurBrnc(dstPth);

  return {
    success: true,
    path: dstPth,
    remoteUrl: input.url,
    branch: input.branch ?? curBrnc2 ?? "HEAD",
    ...(headCommit ? { commitHash: headCommit } : {}),
  };
}
