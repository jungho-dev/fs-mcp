/**
 * @file src/features/git/git-session.ts
 * @description Git working directory and path helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import fs from "node:fs/promises";
import path from "node:path";
import {runGitCommand, PROTECTED_BRANCHES} from "@features/git/git-runtime";
import {validatePath} from "@features/filesystem/filesystem-service";

let currentGitWorkingDirectory: string | null = null;

// 1. session get ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getCurrentGitWorkingDirectory(): string | null {
  return currentGitWorkingDirectory;
}

// 2. session set ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function setCurrentGitWorkingDirectory(workingDirectory: string | null): void {
  currentGitWorkingDirectory = workingDirectory;
}

// 3. existing path resolve ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveExistingPath(requestedPath: string): Promise<string> {
  const resolvedPath = await validatePath(requestedPath);
  return resolvedPath;
}

// 4. creation path resolve ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveCreationPath(requestedPath: string): Promise<string> {
  const validatedPath = await validatePath(requestedPath);
  const resolvedPath = path.resolve(validatedPath);
  return resolvedPath;
}

// 5. directory ensure ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function ensureDirectoryExists(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

// 6. repository root lookup ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getRepositoryRoot(cwd: string): Promise<string> {
  const commandResult = await runGitCommand(["rev-parse", "--show-toplevel"], { cwd });
  return commandResult.stdout.trim();
}

// 7. repository path resolve ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveRepositoryPath(requestedPath?: string): Promise<string> {
  const basePath = requestedPath ?? currentGitWorkingDirectory;

  if (!basePath) {
    throw new Error("No git working directory set. Pass path or call git_set_working_dir first.");
  }

  return await getRepositoryRoot(await resolveExistingPath(basePath));
}

// 8. creation base resolve ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveCreationBasePath(requestedPath?: string): Promise<string> {
  const basePath = requestedPath ?? currentGitWorkingDirectory ?? process.cwd();
  return await resolveCreationPath(basePath);
}

// 9. head commit lookup ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getHeadCommit(cwd: string): Promise<string | null> {
  const commandResult = await runGitCommand(["rev-parse", "HEAD"], { cwd, allowFailure: true });
  const headCommit = commandResult.exitCode === 0 ? commandResult.stdout.trim() : "";
  return headCommit.length > 0 ? headCommit : null;
}

// 10. current branch lookup ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const commandResult = await runGitCommand(["branch", "--show-current"], { cwd, allowFailure: true });
  const branchName = commandResult.stdout.trim();
  return branchName.length > 0 ? branchName : null;
}

// 11. protected branch guard ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isProtectedBranch(branchName: string | null): boolean {
  const protectedBranch = branchName !== null && PROTECTED_BRANCHES.has(branchName.toLowerCase());
  return protectedBranch;
}

// 12. protected branch confirm ―――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function ensureProtectedBranchConfirmation(cwd: string, confirmed: boolean | undefined, reason: string): Promise<void> {
  const branchName = await getCurrentBranch(cwd);

  if (isProtectedBranch(branchName) && confirmed !== true) {
    throw new Error(`${reason} requires confirmed: true on protected branches.`);
  }
}
