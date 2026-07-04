/**
 * @file src/features/git/git-operations-working-tree.ts
 * @description Working tree and commit git operations.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { normalizeCommitMessage as nrmlCmmtMsg, runGitCommand as rnGtCmd, requireGitTextArgument as rqrGtTxtArg, resolveGitTextArgument as rslvGtTxtAr, splitLines } from "@features/git/git-runtime";
import { getHeadCommit as gtHdCmmt, resolveRepositoryPath as rslvRepoPth } from "@features/git/git-session";
import { getStatusSummary as gtStatSmmr, sumNumstat, toSnakeStatus as tSnkStat } from "@features/git/git-status-support";
import type { GitArgsMap, GitToolOutput as GtTlOtpt } from "@features/git/git-types";

const GPG_SGN_PAT = /gpg|sign/i;
// biome-ignore lint/security/noSecrets: Git pretty-format token string, not credential material.
const CMM_SMM_FRM = "%H%x1f%an <%ae>%x1f%ct%x1f%s%x1f%G?";

// 1. Looks conventional --------------------------------------------------------------------------
// Mirrors the rust-fs-mcp header check: "<type>: <summary>" with a lowercase/dash/paren type
// and at least one ASCII letter in the summary.
function looksConventional(message: string): boolean {
  const header = message.split("\n")[0] ?? "";
  const sepIndex = header.indexOf(": ");

  if (sepIndex < 0) {
    return false;
  }
  const kind = header.slice(0, sepIndex);
  const summary = header.slice(sepIndex + 2);

  return /^[a-z()-]*$/.test(kind) && /[a-zA-Z]/.test(summary);
}

// 2. Author identity ------------------------------------------------------------------------------
function authorIdentity(author: { name: string; email: string } | undefined): string[] {
  if (!author) {
    return [];
  }
  return ["--author", `${author.name} <${author.email}>`];
}

// 3. Run commit with retry ------------------------------------------------------------------------
// Retries once with --no-gpg-sign when the failure looks like a signing problem.
async function runCommitWithRetry(cwd: string, commitArgs: string[]): Promise<string | undefined> {
  let sgnnWrnn: string | undefined;
  let commitResult = await rnGtCmd(commitArgs, { cwd, allowFailure: true });

  if (commitResult.exitCode !== 0) {
    const cmbnFlr = [commitResult.stderr, commitResult.stdout].join("\n");

    if (GPG_SGN_PAT.test(cmbnFlr)) {
      sgnnWrnn = cmbnFlr.trim();
      commitResult = await rnGtCmd([...commitArgs, "--no-gpg-sign"], { cwd, allowFailure: true });
    }
  }
  if (commitResult.exitCode !== 0) {
    throw new Error([commitResult.stderr.trim(), commitResult.stdout.trim()].filter((value) => value.length > 0).join("\n"));
  }
  return sgnnWrnn;
}

// 4. Build commit output --------------------------------------------------------------------------
// Reads the HEAD commit back so commit and amend report the same summary shape.
async function buildCommitOutput(cwd: string, sgnnWrnn: string | undefined): Promise<GtTlOtpt> {
  const headCommit = await gtHdCmmt(cwd);

  if (!headCommit) {
    throw new Error("Commit completed but HEAD is unavailable.");
  }
  const smmrRes2 = await rnGtCmd(["show", "--numstat", `--format=${CMM_SMM_FRM}`, "-1", headCommit], { cwd });
  const summaryLines = splitLines(smmrRes2.stdout);
  const headerParts = summaryLines[0].split("\x1f");
  const numstatText = summaryLines.slice(1).join("\n");
  const status = await gtStatSmmr(cwd, true);
  const diffStats = sumNumstat(numstatText);
  const cmmtFls = summaryLines.slice(1).map((line) => line.split("\t").slice(2).join("\t").trim()).filter((value) => value.length > 0);

  return {
    success: true,
    commitHash: headerParts[0],
    author: headerParts[1],
    timestamp: Number.parseInt(headerParts[2], 10),
    message: headerParts[3],
    filesChanged: cmmtFls.length,
    committedFiles: cmmtFls,
    ...(diffStats.insertions !== undefined ? { insertions: diffStats.insertions } : {}),
    ...(diffStats.deletions !== undefined ? { deletions: diffStats.deletions } : {}),
    signed: (headerParts[4] ?? "").trim().length > 0 && (headerParts[4] ?? "").trim() !== "N",
    ...(sgnnWrnn ? { signingWarning: sgnnWrnn } : {}),
    status: tSnkStat(status),
  };
}

// 5. Run git add ------------------------------------------------------------------------------------
export async function runGitAdd(input: GitArgsMap["git-add"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);
  const paths = input.paths ?? [];
  const all = input.all === true;
  const update = input.update === true;

  // No implicit "." pathspec: staging everything must be an explicit all/update request.
  if (paths.length === 0 && !all && !update) {
    throw new Error("paths is required unless all or update is set");
  }
  await rnGtCmd(
    [
      "add",
      ...(all ? ["--all"] : []),
      ...(update ? ["--update"] : []),
      ...(input.force ? ["--force"] : []),
      "--",
      ...paths,
    ],
    { cwd },
  );

  const status = await gtStatSmmr(cwd, true);
  const stagedFiles = Object.values(status.stagedChanges).flatMap((value) => value ?? []);

  return {
    success: true,
    stagedFiles,
    totalFiles: stagedFiles.length,
    status: tSnkStat(status),
  };
}

// 6. Run git commit -------------------------------------------------------------------------------
export async function runGitCommit(input: GitArgsMap["git-commit"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);

  if (input.filesToStage && input.filesToStage.length > 0) {
    await rnGtCmd(["add", "--", ...input.filesToStage], { cwd });
  }
  const cmmtMsg2 = await rqrGtTxtArg(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  const normCmmtMsg = nrmlCmmtMsg(cmmtMsg2);

  if (!looksConventional(normCmmtMsg)) {
    throw new Error("Commit message must start with an English Conventional Commit header");
  }
  // Inject committer identity so commit works without local git config.
  // `--author` overrides AUTHOR only; COMMITTER must come from -c, git config, or env.
  const commitArgs = ["-c", "user.name=fs-mcp", "-c", "user.email=fs-mcp@example.invalid", "commit", ...authorIdentity(input.author), "-m", normCmmtMsg, ...(input.amend ? ["--amend"] : []), ...(input.allowEmpty ? ["--allow-empty"] : []), ...(input.noVerify ? ["--no-verify"] : [])];
  const sgnnWrnn = await runCommitWithRetry(cwd, commitArgs);

  return await buildCommitOutput(cwd, sgnnWrnn);
}

// 7. Run git amend --------------------------------------------------------------------------------
// Amends HEAD in place. A new message replaces the header; otherwise --no-edit reuses it.
export async function runGitAmend(input: GitArgsMap["git-amend"]): Promise<GtTlOtpt> {
  const cwd = await rslvRepoPth(input.path);

  // Amend rewrites HEAD, so a commit must already exist; report it clearly instead of git's raw error.
  if ((await gtHdCmmt(cwd)) === null) {
    throw new Error("Cannot amend: repository has no commits yet");
  }
  // --author and --reset-author both rewrite authorship; combining them is ambiguous.
  if (input.author && input.resetAuthor === true) {
    throw new Error("author and resetAuthor cannot be combined");
  }
  if (input.filesToStage && input.filesToStage.length > 0) {
    await rnGtCmd(["add", "--", ...input.filesToStage], { cwd });
  }
  const rawMessage = await rslvGtTxtAr(input.message, input.messagePath, input.messageOffset, input.messageLength, "message");
  const newMessage = rawMessage === undefined ? undefined : nrmlCmmtMsg(rawMessage);

  if (newMessage !== undefined && !looksConventional(newMessage)) {
    throw new Error("Commit message must start with an English Conventional Commit header");
  }
  // Inject committer identity so amend works without local git config; with --reset-author
  // this identity also becomes the rewritten author.
  const commitArgs = ["-c", "user.name=fs-mcp", "-c", "user.email=fs-mcp@example.invalid", "commit", "--amend", ...authorIdentity(input.author), ...(input.resetAuthor ? ["--reset-author"] : []), ...(newMessage !== undefined ? ["-m", newMessage] : ["--no-edit"]), ...(input.allowEmpty ? ["--allow-empty"] : []), ...(input.noVerify ? ["--no-verify"] : [])];
  const sgnnWrnn = await runCommitWithRetry(cwd, commitArgs);

  return await buildCommitOutput(cwd, sgnnWrnn);
}

// 8. Run git diff -----------------------------------------------------------------------------------
export async function runGitDiff(input: GitArgsMap["git-diff"]): Promise<GtTlOtpt> {
  // A leading '-' revision would be parsed as a git option (e.g. --output) and could write
  // files outside the repository, so option-like revisions are rejected.
  for (const value of [input.source, input.target]) {
    if (value !== undefined && value.startsWith("-")) {
      throw new Error(`revision must not start with '-': ${value}`);
    }
  }
  const cwd = await rslvRepoPth(input.path);
  const check = input.check === true;
  const diffArgs = ["diff"];

  if (check) {
    // --check inspects the diff for whitespace errors and leftover conflict markers instead of
    // emitting a patch, so it supersedes the --name-only / --stat / --unified output shapes;
    // source/target/staged/paths still select which diff is inspected.
    diffArgs.push("--check");
  }
  else if (input.nameOnly === true) {
    diffArgs.push("--name-only");
  }
  else if (input.stat === true) {
    diffArgs.push("--stat");
  }
  else if (input.contextLines !== undefined) {
    diffArgs.push(`--unified=${String(input.contextLines)}`);
  }
  if (input.staged === true) {
    diffArgs.push("--staged");
  }
  else {
    if (input.source !== undefined) {
      diffArgs.push(input.source);
    }
    if (input.target !== undefined) {
      diffArgs.push(input.target);
    }
  }
  if (input.paths && input.paths.length > 0) {
    diffArgs.push("--", ...input.paths);
  }
  // `git diff --check` exits 2 when problems are found; that is a successful check result,
  // not a git failure, so it surfaces as clean=false with the offending lines.
  if (check) {
    const checkRes = await rnGtCmd(diffArgs, { cwd, allowFailure: true });
    if (checkRes.exitCode === 0) {
      return { success: true, path: cwd, clean: true, diff: "No whitespace errors or conflict markers" };
    }
    if (checkRes.exitCode > 0 && checkRes.exitCode < 128) {
      return { success: true, path: cwd, clean: false, diff: checkRes.stdout.trimEnd() };
    }
    throw new Error([checkRes.stderr.trim(), checkRes.stdout.trim()].filter((value) => value.length > 0).join("\n"));
  }
  const diffResult = await rnGtCmd(diffArgs, { cwd });

  return { success: true, path: cwd, diff: diffResult.stdout.trimEnd() };
}

// 9. Run git show -----------------------------------------------------------------------------------
export async function runGitShow(input: GitArgsMap["git-show"]): Promise<GtTlOtpt> {
  const objects = input.objects && input.objects.length > 0 ? [...input.objects] : input.object !== undefined ? [input.object] : [];
  const fromSingle = input.objects === undefined || input.objects.length === 0;

  if (objects.length === 0) {
    throw new Error("object or objects is required");
  }
  // A leading '-' object would be parsed as a git option and could write arbitrary files.
  for (const object of objects) {
    if (object.startsWith("-")) {
      throw new Error(`object must not start with '-': ${object}`);
    }
  }
  const cwd = await rslvRepoPth(input.path);
  // Every requested revision goes to one git invocation, so a multi-revision history query
  // costs a single tool round-trip; stat / format=raw control the body instead of always
  // returning the full patch. filePath pairs with each revision as object:filePath.
  const showArgs = ["show", ...(input.stat ? ["--stat"] : []), ...(input.format ? [`--format=${input.format}`] : [])];

  for (const object of objects) {
    showArgs.push(input.filePath !== undefined ? `${object}:${input.filePath}` : object);
  }
  const showResult = await rnGtCmd(showArgs, { cwd });

  return {
    success: true,
    path: cwd,
    ...(fromSingle ? { object: objects[0] } : { objects }),
    content: showResult.stdout.trimEnd(),
  };
}
