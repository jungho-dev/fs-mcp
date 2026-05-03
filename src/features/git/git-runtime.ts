/**
 * @file src/features/git/git-runtime.ts
 * @description Shared git runtime helpers.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {GitCommandError, GitCommandResult} from "@features/git/git-types";

const execFileAsync = promisify(execFile);
const GIT_EXEC_MAX_BUFFER = 20 * 1024 * 1024;

export const AUTO_EXCLUDE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
  "Cargo.lock",
  "flake.lock",
  "pubspec.lock",
  "mix.lock",
  "Podfile.lock",
  "packages.lock.json",
] as const;

export const PROTECTED_BRANCHES = new Set(["main", "master", "production", "prod", "release"]);
export const CONFLICT_STATUS_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

// 1. git command execution ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitCommand(args: string[], options: { cwd?: string; allowFailure?: boolean } = {}): Promise<GitCommandResult> {
  let commandResult: GitCommandResult;

  try {
    const {stdout, stderr} = await execFileAsync("git", args, {
      cwd: options.cwd,
      env: process.env,
      maxBuffer: GIT_EXEC_MAX_BUFFER,
      windowsHide: true,
    });
    commandResult = { stdout, stderr, exitCode: 0 };
  }
  catch (error) {
    const commandError = error as GitCommandError;
    const failedResult = {
      stdout: commandError.stdout ?? "",
      stderr: commandError.stderr ?? commandError.message,
      exitCode: typeof commandError.code === "number" ? commandError.code : 1,
    };

    if (options.allowFailure) {
      commandResult = failedResult;
    }
    else {
      const errorMessage = [failedResult.stderr.trim(), failedResult.stdout.trim()].filter((value) => value.length > 0).join("\\n");
      throw new Error(errorMessage.length > 0 ? errorMessage : commandError.message);
    }
  }

  return commandResult;
}

// 2. line split helper ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function splitLines(text: string): string[] {
  const splitResult = text.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n").split("\\n").filter((line) => line.length > 0);
  return splitResult;
}

// 3. commit message normalize ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function normalizeCommitMessage(message: string): string {
  const normalizedMessage = message.replace(/\\\\n/g, "\\n").replace(/\\\\r/g, "\\r").replace(/\\\\t/g, "\\t");
  return normalizedMessage;
}
