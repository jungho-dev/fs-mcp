/**
 * @file src/features/git/git-operations-repository.ts
 * @description Repository-scoped git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import path from "node:path";
import { runGitCommand } from "@features/git/git-runtime";
import { ensureDirectoryExists, getCurrentBranch, getCurrentGitWorkingDirectory, getHeadCommit, getRepositoryRoot, resolveCreationBasePath, resolveCreationPath, resolveRepositoryPath, setCurrentGitWorkingDirectory } from "@features/git/git-session";
import { gatherRepositorySnapshot, getStatusSummary } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput } from "@features/git/git-types";

// 1. git_set_working_dir ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitSetWorkingDir(input: GitArgsMap["git_set_working_dir"]): Promise<GitToolOutput> {
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
    setCurrentGitWorkingDirectory(await getRepositoryRoot(resolvedPath));
  }
  else {
  	setCurrentGitWorkingDirectory(resolvedPath);
  }
  let repository;
  let enrichmentWarnings;
  const currentWorkingDirectory = getCurrentGitWorkingDirectory();

  if (shouldValidateRepository && currentWorkingDirectory) {
    try {
      repository = await gatherRepositorySnapshot(currentWorkingDirectory);
    }
    catch (error) {
      enrichmentWarnings = [`Repository snapshot skipped: ${error instanceof Error ? error.message : String(error)}`];
    }
  }
  return {
    success: true,
    path: currentWorkingDirectory,
    message: `Working directory set to: ${currentWorkingDirectory}`,
    ...(repository ? { repository } : {}),
    ...(enrichmentWarnings ? { enrichmentWarnings } : {}),
  };
}

// 2. git_clear_working_dir ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitClearWorkingDir(): Promise<GitToolOutput> {
  const previousPath = getCurrentGitWorkingDirectory();

  setCurrentGitWorkingDirectory(null);

  return {
    success: true,
    message: "Cleared git working directory.",
    ...(previousPath ? { previousPath } : {}),
  };
}

// 3. git_status ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitStatus(input: GitArgsMap["git_status"]): Promise<GitToolOutput> {
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

// 4. git_init ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitInit(input: GitArgsMap["git_init"]): Promise<GitToolOutput> {
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

// 5. git_clone ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitClone(input: GitArgsMap["git_clone"]): Promise<GitToolOutput> {
  const destinationPath = await resolveCreationPath(input.path);

  await ensureDirectoryExists(path.dirname(destinationPath));
  await runGitCommand(["clone", ...(input.bare ? ["--bare"] : []), ...(input.mirror ? ["--mirror"] : []), ...(input.branch ? ["--branch", input.branch] : []), ...(input.depth ? [`--depth=${String(input.depth)}`] : []), input.url, destinationPath]);

  const headCommit = await getHeadCommit(destinationPath);
  const currentBranch = await getCurrentBranch(destinationPath);

  return {
    success: true,
    path: destinationPath,
    remoteUrl: input.url,
    branch: input.branch ?? currentBranch ?? "HEAD",
    ...(headCommit ? { commitHash: headCommit } : {}),
  };
}
