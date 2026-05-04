/**
 * @file src/features/git/git-session.ts
 * @description Git working directory and path helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import fs from "node:fs/promises";
import path from "node:path";
import {validatePath} from "@features/filesystem/filesystem-service";
import {PROTECTED_BRANCHES, runGitCommand } from "@features/git/git-runtime";

let currentGitWorkingDirectory: string | null = null;

// 1. Get current git working directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function getCurrentGitWorkingDirectory(): string | null {
  return currentGitWorkingDirectory;
}

// 2. Set current git working directory ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function setCurrentGitWorkingDirectory(workingDirectory: string | null): void {
  currentGitWorkingDirectory = workingDirectory;
}

// 3. Resolve existing path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveExistingPath(requestedPath: string): Promise<string> {
  const resolvedPath = await validatePath(requestedPath);
  return resolvedPath;
}

// 4. Resolve creation path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveCreationPath(requestedPath: string): Promise<string> {
  const validatedPath = await validatePath(requestedPath);
  const resolvedPath = path.resolve(validatedPath);
  return resolvedPath;
}

// 5. Ensure directory exists ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function ensureDirectoryExists(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

// 6. Get repository root ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getRepositoryRoot(cwd: string): Promise<string> {
  const commandResult = await runGitCommand(["rev-parse", "--show-toplevel"], { cwd });
  return commandResult.stdout.trim();
}

// 7. Resolve repository path ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveRepositoryPath(requestedPath?: string): Promise<string> {
  const basePath = requestedPath ?? currentGitWorkingDirectory;

  if (!basePath) {
    throw new Error("No git working directory set. Pass path or call git_set_working_dir first.");
  }

  return await getRepositoryRoot(await resolveExistingPath(basePath));
}

// 8. Resolve creation base path ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function resolveCreationBasePath(requestedPath?: string): Promise<string> {
  const basePath = requestedPath ?? currentGitWorkingDirectory ?? process.cwd();
  return await resolveCreationPath(basePath);
}

// 9. Get head commit ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getHeadCommit(cwd: string): Promise<string | null> {
  const commandResult = await runGitCommand(["rev-parse", "HEAD"], { cwd, allowFailure: true });
  const headCommit = commandResult.exitCode === 0 ? commandResult.stdout.trim() : "";
  return headCommit.length > 0 ? headCommit : null;
}

// 10. Get current branch ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const commandResult = await runGitCommand(["branch", "--show-current"], { cwd, allowFailure: true });
  const branchName = commandResult.stdout.trim();
  return branchName.length > 0 ? branchName : null;
}

// 11. Is protected branch ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function isProtectedBranch(branchName: string | null): boolean {
  const protectedBranch = branchName !== null && PROTECTED_BRANCHES.has(branchName.toLowerCase());
  return protectedBranch;
}

// 12. Ensure protected branch confirmation ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function ensureProtectedBranchConfirmation(cwd: string, confirmed: boolean | undefined, reason: string): Promise<void> {
  const branchName = await getCurrentBranch(cwd);

  if (isProtectedBranch(branchName) && confirmed !== true) {
    throw new Error(`${reason} requires confirmed: true on protected branches.`);
  }
}
