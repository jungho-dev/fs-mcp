/**
 * @file src/features/git/git-session.ts
 * @description Git working directory and path helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {AsyncLocalStorage as AsynLclStrg} from "node:async_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import {validatePath} from "@features/filesystem/filesystem-service";
import {PRTC_BRNC, runGitCommand as rnGtCmd } from "@features/git/git-runtime";

const DGSK = "__default__";
const gtSessScp = new AsynLclStrg<string>();
const gtWrknDrct = new Map<string, string>();

// 1. Get current git session key ------------------------------------------------------------------
function getCurrentGitSessionKey(): string {
  const sessionKey = gtSessScp.getStore();
  return sessionKey ?? DGSK;
}

// 2. Run with git session scope -------------------------------------------------------------------
export async function runWithGitSessionScope<T>(sessionKey: string, operation: () => Promise<T>): Promise<T> {
  return await gtSessScp.run(sessionKey, operation);
}

// 3. Get current git working directory ------------------------------------------------------------
export function getCurrentGitWorkingDirectory(): string | null {
  const curWrknDir = gtWrknDrct.get(getCurrentGitSessionKey());
  return curWrknDir ?? null;
}

// 4. Set current git working directory ------------------------------------------------------------
export function setCurrentGitWorkingDirectory(wrknDir: string | null): void {
  const sessionKey = getCurrentGitSessionKey();
  if (wrknDir === null) {
    gtWrknDrct.delete(sessionKey);
  }
  else {
    gtWrknDrct.set(sessionKey, wrknDir);
  }
}

// 3. Resolve existing path ------------------------------------------------------------------------
export async function resolveExistingPath(rqstPth: string): Promise<string> {
  const resolvedPath = await validatePath(rqstPth);
  return resolvedPath;
}

// 4. Resolve creation path ------------------------------------------------------------------------
export async function resolveCreationPath(rqstPth: string): Promise<string> {
  const vldtPth = await validatePath(rqstPth);
  const resolvedPath = path.resolve(vldtPth);
  return resolvedPath;
}

// 5. Ensure directory exists ----------------------------------------------------------------------
export async function ensureDirectoryExists(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

// 6. Get repository root --------------------------------------------------------------------------
export async function getRepositoryRoot(cwd: string): Promise<string> {
  const cmdRes = await rnGtCmd(["rev-parse", "--show-toplevel"], { cwd });
  return cmdRes.stdout.trim();
}

// 7. Resolve repository path ----------------------------------------------------------------------
export async function resolveRepositoryPath(rqstPth?: string): Promise<string> {
  const basePath = rqstPth ?? getCurrentGitWorkingDirectory();

  if (!basePath) {
    throw new Error("No git working directory set. Pass path or call git-set-workdir first.");
  }

  return await getRepositoryRoot(await resolveExistingPath(basePath));
}

// 8. Resolve creation base path -------------------------------------------------------------------
export async function resolveCreationBasePath(rqstPth?: string): Promise<string> {
  const basePath = rqstPth ?? getCurrentGitWorkingDirectory() ?? process.cwd();
  return await resolveCreationPath(basePath);
}

// 9. Get head commit ------------------------------------------------------------------------------
export async function getHeadCommit(cwd: string): Promise<string | null> {
  const cmdRes = await rnGtCmd(["rev-parse", "HEAD"], { cwd, allowFailure: true });
  const headCommit = cmdRes.exitCode === 0 ? cmdRes.stdout.trim() : "";
  return headCommit.length > 0 ? headCommit : null;
}

// 10. Get current branch --------------------------------------------------------------------------
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const cmdRes = await rnGtCmd(["branch", "--show-current"], { cwd, allowFailure: true });
  const branchName = cmdRes.stdout.trim();
  return branchName.length > 0 ? branchName : null;
}

// 11. Is protected branch -------------------------------------------------------------------------
export function isProtectedBranch(branchName: string | null): boolean {
  const prtcBrnc = branchName !== null && PRTC_BRNC.has(branchName.toLowerCase());
  return prtcBrnc;
}

// 12. Ensure protected branch confirmation --------------------------------------------------------
export async function ensureProtectedBranchConfirmation(cwd: string, confirmed: boolean | undefined, reason: string): Promise<void> {
  const branchName = await getCurrentBranch(cwd);

  if (isProtectedBranch(branchName) && confirmed !== true) {
    throw new Error(`${reason} requires confirmed: true on protected branches.`);
  }
}
