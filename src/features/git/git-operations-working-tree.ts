/**
 * @file src/features/git/git-operations-working-tree.ts
 * @description Working tree and commit git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { AUTO_EXCLUDE_PATTERNS, normalizeCommitMessage, runGitCommand, splitLines } from "@features/git/git-runtime";
import { getHeadCommit, resolveRepositoryPath } from "@features/git/git-session";
import { detectAutoExcludedFiles, getStatusSummary, parseRefs, sumNumstat, toSnakeStatus } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput } from "@features/git/git-types";

// 1. git_add ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitAdd(input: GitArgsMap["git_add"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);

  await runGitCommand(
    [
      "add",
      ...(input.all ? ["--all"] : []),
      ...(input.update ? ["--update"] : []),
      ...(input.force ? ["--force"] : []),
      ...(input.paths && input.paths.length > 0 ? input.paths : input.all ? [] : ["."]),
    ],
    { cwd },
  );

  const status = await getStatusSummary(cwd, true);
  const stagedFiles = Object.values(status.stagedChanges).flatMap((value) => value ?? []);

  return {
    success: true,
    stagedFiles,
    totalFiles: stagedFiles.length,
    status: toSnakeStatus(status),
  };
}

// 2. git_commit ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitCommit(input: GitArgsMap["git_commit"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);

  if (input.filesToStage && input.filesToStage.length > 0) {
    await runGitCommand(["add", ...input.filesToStage], { cwd });
  }
  const commitArgs = ["commit", "-m", normalizeCommitMessage(input.message), ...(input.amend ? ["--amend"] : []), ...(input.allowEmpty ? ["--allow-empty"] : []), ...(input.noVerify ? ["--no-verify"] : []), ...(input.author ? ["--author", `${input.author.name} <${input.author.email}>`] : [])];
  let signingWarning;
  let commitResult = await runGitCommand(commitArgs, { cwd, allowFailure: true });

  if (commitResult.exitCode !== 0) {
    const combinedFailure = [commitResult.stderr, commitResult.stdout].join("\n");

    if (/gpg|sign/i.test(combinedFailure)) {
      signingWarning = combinedFailure.trim();
      commitResult = await runGitCommand([...commitArgs, "--no-gpg-sign"], { cwd, allowFailure: true });
    }
  }
  if (commitResult.exitCode !== 0) {
  	throw new Error([commitResult.stderr.trim(), commitResult.stdout.trim()].filter((value) => value.length > 0).join("\n"));
  }
  const headCommit = await getHeadCommit(cwd);

  if (!headCommit) {
  	throw new Error("Commit completed but HEAD is unavailable.");
  }
  const summaryResult = await runGitCommand(["show", "--stat", "--format=%H%x1f%an <%ae>%x1f%ct%x1f%s", "-1", headCommit], { cwd });
  const headerLine = splitLines(summaryResult.stdout)[0];
  const headerParts = headerLine.split("\x1f");
  const numstatResult = await runGitCommand(["show", "--numstat", "--format=", "-1", headCommit], { cwd, allowFailure: true });
  const changedFilesResult = await runGitCommand(["diff-tree", "--no-commit-id", "--name-only", "-r", headCommit], { cwd, allowFailure: true });
  const signatureResult = await runGitCommand(["log", "-1", "--pretty=format:%G?"], { cwd, allowFailure: true });
  const status = await getStatusSummary(cwd, true);
  const diffStats = sumNumstat(numstatResult.stdout);
  const committedFiles = splitLines(changedFilesResult.stdout);

  return {
    success: true,
    commitHash: headerParts[0],
    author: headerParts[1],
    timestamp: Number.parseInt(headerParts[2], 10),
    message: headerParts[3],
    filesChanged: committedFiles.length,
    committedFiles,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    signed: signatureResult.stdout.trim().length > 0 && signatureResult.stdout.trim() !== "N",
    ...(signingWarning ? { signingWarning } : {}),
    status: toSnakeStatus(status),
  };
}

// 3. git_diff ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitDiff(input: GitArgsMap["git_diff"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const contextLines = input.contextLines ?? 3;
  const autoExclude = input.autoExclude ?? true;
  const diffRange = [...(input.staged ? ["--cached"] : []), ...(input.source ? [input.source] : []), ...(!input.source && input.target ? [input.target] : []), ...(input.source && input.target ? [input.target] : [])];
  const pathspecs = input.paths && input.paths.length > 0 ? [...input.paths] : ["."];
  const excludeSpecs = autoExclude ? AUTO_EXCLUDE_PATTERNS.map((pattern) => `:(exclude)${pattern}`) : [];
  const diffArgs = ["diff", ...(input.nameOnly ? ["--name-only"] : []), ...(input.stat ? ["--stat"] : []), `--unified=${String(contextLines)}`, ...diffRange, "--", ...pathspecs, ...excludeSpecs];
  const diffResult = await runGitCommand(diffArgs, { cwd });
  const numstatResult = await runGitCommand(["diff", "--numstat", ...diffRange, "--", ...pathspecs, ...excludeSpecs], { cwd, allowFailure: true });
  const diffStats = sumNumstat(numstatResult.stdout);
  let diffText = diffResult.stdout;
  let untrackedFiles: string[] = [];

  if (input.includeUntracked) {
    const untrackedResult = await runGitCommand(["ls-files", "--others", "--exclude-standard"], { cwd, allowFailure: true });
    untrackedFiles = splitLines(untrackedResult.stdout);
    if (untrackedFiles.length > 0) {
    	diffText = diffText.length > 0 ? `${diffText}\n\n# Untracked files\n${untrackedFiles.join("\n")}` : `# Untracked files\n${untrackedFiles.join("\n")}`;
    }
  }
  const nameOnlyResult = autoExclude ? await runGitCommand(["diff", "--name-only", ...diffRange, "--", ...pathspecs], { cwd, allowFailure: true }) : null;
  const excludedFiles = autoExclude && nameOnlyResult ? detectAutoExcludedFiles(splitLines(nameOnlyResult.stdout), AUTO_EXCLUDE_PATTERNS) : [];

  return {
    success: true,
    diff: diffText,
    filesChanged: diffStats.filesChanged + untrackedFiles.length,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    ...(excludedFiles.length > 0 ? { excludedFiles } : {}),
  };
}

// 4. git_log ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitLog(input: GitArgsMap["git_log"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const maxCount = input.maxCount ?? 20;
  const logArgs = ["log", `--max-count=${String(maxCount)}`, ...(input.skip !== undefined ? [`--skip=${String(input.skip)}`] : []), ...(input.author ? [`--author=${input.author}`] : []), ...(input.grep ? [`--grep=${input.grep}`] : []), ...(input.since ? [`--since=${input.since}`] : []), ...(input.until ? [`--until=${input.until}`] : []), ...(input.showSignature ? ["--show-signature"] : []), "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ct%x1f%P%x1f%d%x1f%s%x1f%b%x1e", ...(input.branch ? [input.branch] : []), ...(input.filePath ? ["--", input.filePath] : [])];
  const commandResult = await runGitCommand(logArgs, { cwd, allowFailure: true });

  if (commandResult.exitCode !== 0) {
    return {
      success: true,
      commits: [],
      totalCount: 0,
      ...(input.branch || input.author || input.grep || input.filePath || input.since || input.until ? { note: "No commits matched the provided filters." } : {}),
    };
  }
  const commits = [];
  const entries = commandResult.stdout
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    const parts = entry.split("\x1f");
    const commitRecord: Record<string, unknown> = {
      hash: parts[0],
      shortHash: parts[1],
      subject: parts[7],
    };

    if (!input.oneline) {
      Object.assign(commitRecord, {
        author: parts[2],
        authorEmail: parts[3],
        timestamp: Number.parseInt(parts[4], 10),
        ...(parts[5] ? { parents: parts[5].split(" ").filter((value) => value.length > 0) } : {}),
        ...(parseRefs(parts[6]) ? { refs: parseRefs(parts[6]) } : {}),
        ...(parts[8] ? { body: parts[8] } : {}),
      });

      if (input.stat) {
        const statResult = await runGitCommand(["show", "--stat", "--format=", parts[0]], { cwd, allowFailure: true });
        commitRecord.stat = statResult.stdout.trim();
      }
      if (input.patch) {
        const patchResult = await runGitCommand(["show", "--format=", "--patch", parts[0]], { cwd, allowFailure: true });
        commitRecord.patch = patchResult.stdout;
      }
    }
    commits.push(commitRecord);
  }
  return {
    success: true,
    commits,
    totalCount: commits.length,
  };
}

// 5. git_show ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function runGitShow(input: GitArgsMap["git_show"]): Promise<GitToolOutput> {
  const cwd = await resolveRepositoryPath(input.path);
  const targetObject = input.filePath ? `${input.object}:${input.filePath}` : input.object;
  const showResult = await runGitCommand(["show", ...(input.format ? [`--format=${input.format}`] : []), ...(input.stat ? ["--stat"] : []), targetObject], { cwd });
  const typeResult = input.filePath ? { stdout: "blob" } : await runGitCommand(["cat-file", "-t", input.object], { cwd, allowFailure: true });

  return {
    success: true,
    object: input.object,
    type: typeResult.stdout.trim() || "commit",
    content: showResult.stdout,
  };
}
