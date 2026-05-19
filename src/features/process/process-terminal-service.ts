/**
 * @file src/features/process/process-terminal-service.ts
 * @description Terminal session service.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {type SpawnOptions, spawn} from "node:child_process";
import os from "node:os";
import path from "node:path";
import type {ActiveSession as ActvSess, CommandExecutionResult as CmdExctRes, OutputEvent, TerminalSession as TrmnSess, TimingInfo} from "@assets/type/common";
import {cfgMgr} from "@features/config/config-store";
import {analyzeProcessState as anlyProcSt} from "@features/process/process-repl-detector";

const DEF_CMD_TMT = 1000;
const MAOL = 100_000;
const MCOL = 100_000;
const MX_CMPL_SSSN = 200;
const MPSC = 120_000;
const MX_TMNG_EVTS = 2_000;
const SCPP = /^ssh /;
const QCK_PRMP_PAT = />>>\s*$|>\s*$|\$\s*$|#\s*$/;
const OSNP = /\n/g;

interface CompletedSession {
  discardedLineCount: number;
  endTime: Date;
  exitCode: number | null;
  outputLines: string[]; // Line-based buffer (consistent with active sessions)
  pid: number;
  startTime: Date;
}

// Result type for paginated output reading
export declare interface PaginatedOutputResult {
  discardedLineCount: number;
  exitCode?: number | null; // Exit code if completed
  isComplete: boolean; // Whether process has finished
  lines: string[];
  readCount: number; // Number of lines returned
  readFrom: number; // Starting line of this read
  remaining: number; // Lines remaining after this read
  runtimeMs?: number; // Runtime in milliseconds (for completed processes)
  totalLines: number;
}

// 1. Configuration for spawning a shell with appropriate flags ――――――――――――――――――――――――――――――――――――
interface ShellSpawnConfig {
  args: string[];
  executable: string;
  useShellOption: string | boolean;
}

// 1. Split shell command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function splitShellCommand(shellCommand: string): string[] {
  const matches = shellCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  const parts = matches ?? [shellCommand];

  return parts.map((part) => {
    const isQuoted = (part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"));

    return isQuoted ? part.slice(1, -1) : part;
  });
}

// 2. Append command argument ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function appendCommandArgument(args: string[], commandFlags: string[], command: string, defaultFlag: string): string[] {
  const cmdFlgIdx = args.findIndex((arg) => commandFlags.includes(arg.toLowerCase()));
  const commandArgs = cmdFlgIdx === -1 ? [...args, defaultFlag, command] : [...args.slice(0, cmdFlgIdx + 1), command, ...args.slice(cmdFlgIdx + 1)];

  return commandArgs;
}

// 3. With pwsh output encoding ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function withPwshOutputEncoding(command: string): string {
  const otptEncdCmd = "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);";
  const encdCmd = command.includes("[Console]::OutputEncoding") ? command : `${otptEncdCmd} ${command}`;

  return encdCmd;
}

// 2. Get the appropriate spawn configuration for a given shell ――――――――――――――――――――――――――――――――――――
// This handles login shell flags for different shell types
// 4. Get shell spawn args ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getShellSpawnArgs(shellPath: string, command: string): ShellSpawnConfig {
  const [shllExct, ...shellArgs] = splitShellCommand(shellPath);
  const executable = shllExct ?? shellPath;
  const shellName = path.basename(executable).toLowerCase();

  // Unix shells with login flag support
  if (shellName.includes("bash") || shellName.includes("zsh")) {
    return {
      args: appendCommandArgument(shellArgs.length === 0 ? ["-l"] : shellArgs, ["-c"], command, "-c"),
      executable,
      useShellOption: false,
    };
  }
  // pwsh
  if (shellName === "pwsh" || shellName === "pwsh.exe") {
    const pwshArgs = shellArgs.length === 0 && os.platform() !== "win32" ? ["-Login"] : shellArgs;
    const pwshCommand = withPwshOutputEncoding(command);

    return {
      args: appendCommandArgument(pwshArgs, ["-command", "-c"], pwshCommand, "-Command"),
      executable,
      useShellOption: false,
    };
  }
  // CMD
  if (shellName === "cmd" || shellName === "cmd.exe") {
    return {
      args: appendCommandArgument(shellArgs, ["/c"], command, "/c"),
      executable,
      useShellOption: false,
    };
  }
  // Fish shell (uses -l for login, -c for command)
  if (shellName.includes("fish")) {
    return {
      args: appendCommandArgument(shellArgs.length === 0 ? ["-l"] : shellArgs, ["-c"], command, "-c"),
      executable,
      useShellOption: false,
    };
  }
  // Unknown/other shells - use shell option for safety
  // This provides a fallback for shells we don't explicitly handle
  return {
    args: [],
    executable: command,
    useShellOption: shellPath,
  };
}

// 5. Get process state text window ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function getProcessStateTextWindow(output: string): string {
  return output.length <= MPSC ? output : output.slice(-MPSC);
}

// 5. Terminal manager ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export class TerminalManager {
  private readonly sessions: Map<number, TrmnSess> = new Map();
  private readonly completedSessions: Map<number, CompletedSession> = new Map();

  // 3. Send input to a running process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // @param pid Process ID
  // @param input Text to send to the process
  // @returns Whether input was successfully sent

  // 6. Send input to process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  sendInputToProcess(pid: number, input: string): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }
    try {
      if (session.process.stdin && !session.process.stdin.destroyed) {
        // Ensure input ends with a newline for most REPLs
        const inptWthNwln = input.endsWith("\n") ? input : `${input}\n`;
        session.process.stdin.write(inptWthNwln);
        return true;
      }
      return false;
    }
    catch (error) {
      console.error(`Error sending input to process ${pid}:`, error);
      return false;
    }
  }

  // 7. Execute command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async executeCommand(command: string, timeoutMs: number = DEF_CMD_TMT, shell?: string, cllcTmng: boolean = false): Promise<CmdExctRes> {
    // Get the shell from config if not specified
    let shellToUse: string | boolean | undefined = shell;
    if (!shellToUse) {
      try {
        const config = await cfgMgr.getConfig();
        shellToUse = config.defaultShell || true;
      }
      catch (_error) {
        // If there's an error getting the config, fall back to default
        shellToUse = true;
      }
    }
    // For REPL interactions, we need to ensure stdin, stdout, and stderr are properly configured
    // Note: No special stdio options needed here, Node.js handles pipes by default

    // Enhance SSH commands automatically
    let enhnCmd = command;
    if (command.trim().startsWith("ssh ") && !command.includes(" -t")) {
      enhnCmd = command.replace(SCPP, "ssh -t ");
      console.log(`Enhanced SSH command: ${enhnCmd}`);
    }
    // Get the appropriate spawn configuration for the shell
    let spawnConfig: ShellSpawnConfig;
    let spawnOptions: SpawnOptions;

    if (typeof shellToUse === "string") {
      // Use shell-specific configuration with login flags where appropriate
      spawnConfig = getShellSpawnArgs(shellToUse, enhnCmd);
      spawnOptions = {
        env: {
          ...process.env,
          TERM: "xterm-256color", // Better terminal compatibility
        },
        windowsHide: true, // Prevent visible console windows on Windows
      };

      // Add shell option if needed (for unknown shells)
      if (spawnConfig.useShellOption) {
        spawnOptions.shell = spawnConfig.useShellOption;
      }
    }
    else {
      // Boolean or undefined shell - use default shell option behavior
      spawnConfig = {
        args: [],
        executable: enhnCmd,
        useShellOption: shellToUse,
      };
      spawnOptions = {
        env: {
          ...process.env,
          TERM: "xterm-256color",
        },
        shell: shellToUse,
        windowsHide: true, // Prevent visible console windows on Windows
      };
    }
    // Spawn the process with appropriate arguments
    const childProcess = spawn(spawnConfig.executable, spawnConfig.args, spawnOptions);
    let output = "";
    childProcess.on("error", (error) => {
      output += `Process spawn error: ${error.message}\n`;
    });

    // Ensure childProcess.pid is defined before proceeding
    if (!childProcess.pid) {
      // Return a consistent error object instead of throwing
      return {
        isBlocked: false,
        output: output || "Error: Failed to get process ID. The command could not be executed.",
        pid: -1, // Use -1 to indicate an error state
      };
    }
    const childPid = childProcess.pid;
    const session: TrmnSess = {
      discardedLineCount: 0,
      isBlocked: false,
      lastReadIndex: 0, // Track where "new" output starts
      outputLines: [], // Line-based buffer
      pid: childPid,
      process: childProcess,
      startTime: new Date(),
    };

    this.sessions.set(childPid, session);

    // Timing diagnostics
    const startTime = Date.now();
    let frstOtptTm: number | undefined;
    let lstOtptTm: number | undefined;
    const outputEvents: OutputEvent[] = [];
    let exitReason: TimingInfo["exitReason"] = "timeout";

    return new Promise((resolve) => {
      let resolved = false;
      let prdcChck: NodeJS.Timeout | null = null;

      // Quick prompt patterns for immediate detection
      const resolveOnce = (result: CmdExctRes) => {
        if (resolved) {
          return;
        }
        resolved = true;
        if (prdcChck) {
          clearInterval(prdcChck);
        }
        // Add timing info if requested
        if (cllcTmng) {
          const endTime = Date.now();
          result.timingInfo = {
            endTime,
            exitReason,
            firstOutputTime: frstOtptTm,
            lastOutputTime: lstOtptTm,
            outputEvents: outputEvents.length > 0 ? outputEvents : undefined,
            startTime,
            timeToFirstOutputMs: frstOtptTm ? frstOtptTm - startTime : undefined,
            totalDurationMs: endTime - startTime,
          };
        }
        resolve(result);
      };

      const stdout = childProcess.stdout;
      const stderr = childProcess.stderr;
      if (!stdout || !stderr) {
        throw new Error("Spawned process does not expose stdout/stderr streams.");
      }
      stdout.on("data", (data: Buffer | string) => {
        const text = data.toString();
        const now = Date.now();

        if (!frstOtptTm) {
          frstOtptTm = now;
        }
        lstOtptTm = now;

        output += text;
        // Append to line-based buffer
        this.appendToLineBuffer(session, text);

        // Record output event if collecting timing
        if (cllcTmng) {
          if (outputEvents.length >= MX_TMNG_EVTS) {
            return;
          }
          outputEvents.push({
            deltaMs: now - startTime,
            length: text.length,
            snippet: text.slice(0, 50).replace(OSNP, "\\n"),
            source: "stdout",
            timestamp: now,
          });
        }
        // Immediate check for obvious prompts
        if (QCK_PRMP_PAT.test(text)) {
          session.isBlocked = true;
          exitReason = "early_exit_quick_pattern";

          if (cllcTmng && outputEvents.length > 0) {
            const lstOtptEvt = outputEvents.at(-1);
            if (lstOtptEvt) {
              lstOtptEvt.matchedPattern = "quick_pattern";
            }
          }
          resolveOnce({
            isBlocked: true,
            output,
            pid: childPid,
          });
        }
      });

      stderr.on("data", (data: Buffer | string) => {
        const text = data.toString();
        const now = Date.now();

        if (!frstOtptTm) {
          frstOtptTm = now;
        }
        lstOtptTm = now;

        output += text;
        // Append to line-based buffer
        this.appendToLineBuffer(session, text);

        // Record output event if collecting timing
        if (cllcTmng) {
          if (outputEvents.length >= MX_TMNG_EVTS) {
            return;
          }
          outputEvents.push({
            deltaMs: now - startTime,
            length: text.length,
            snippet: text.slice(0, 50).replace(OSNP, "\\n"),
            source: "stderr",
            timestamp: now,
          });
        }
      });

      // Periodic comprehensive check every 100ms
      prdcChck = setInterval(() => {
        if (output.trim()) {
          const processState = anlyProcSt(getProcessStateTextWindow(output), childPid);
          if (processState.isWaitingForInput) {
            session.isBlocked = true;
            exitReason = "early_exit_periodic_check";
            resolveOnce({
              isBlocked: true,
              output,
              pid: childPid,
            });
          }
        }
      }, 100);

      // Timeout fallback
      setTimeout(() => {
        session.isBlocked = true;
        exitReason = "timeout";
        resolveOnce({
          isBlocked: true,
          output,
          pid: childPid,
        });
      }, timeoutMs);

      childProcess.on("exit", (code: number | null) => {
        if (childPid) {
          const rmvCmLnCn = Math.max(0, session.outputLines.length - MCOL);
          const cmplOtptLns = rmvCmLnCn > 0 ? session.outputLines.slice(-MCOL) : [...session.outputLines];

          // Store completed session before removing active session
          this.completedSessions.set(childPid, {
            discardedLineCount: session.discardedLineCount + rmvCmLnCn,
            endTime: new Date(),
            exitCode: code,
            outputLines: cmplOtptLns,
            pid: childPid,
            startTime: session.startTime,
          });

          // Keep only the most recent completed sessions
          if (this.completedSessions.size > MX_CMPL_SSSN) {
            const oldestKey = Array.from(this.completedSessions.keys())[0];
            this.completedSessions.delete(oldestKey);
          }
          this.sessions.delete(childPid);
        }
        exitReason = "process_exit";
        resolveOnce({
          isBlocked: false,
          output,
          pid: childPid,
        });
      });
    });
  }

  // 4. Append text to a session's line buffer ―――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Handles partial lines and newline splitting
  // 6. Append to line buffer ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private appendToLineBuffer(session: TrmnSess, text: string): void {
    if (!text) {
      return;
    }
    // Split text into lines, keeping track of whether text ends with newline
    const lines = text.split("\n");

    lines.forEach((line, index) => {
      if (session.outputLines.length === 0) {
        // First line ever
        session.outputLines.push(line);
      }
      else if (index === 0) {
        // First fragment - append to last line (might be partial)
        session.outputLines[session.outputLines.length - 1] += line;
      }
      else {
        // Subsequent lines - add as new lines
        session.outputLines.push(line);
      }
    });
    if (session.outputLines.length > MAOL) {
      const removedCount = session.outputLines.length - MAOL;
      session.outputLines.splice(0, removedCount);
      session.discardedLineCount += removedCount;
      session.lastReadIndex = Math.max(0, session.lastReadIndex - removedCount);
    }
  }

  // 5. Read process output with pagination (like file reading) ――――――――――――――――――――――――――――――――――――
  // @param pid Process ID
  // @param offset Line offset: 0=from lastReadIndex, positive=absolute, negative=tail
  // @param length Max lines to return. Omit to read through available output.
  // @param updateReadIndex Whether to update lastReadIndex (default: true for offset=0)

  // 9. Read output paginated ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  readOutputPaginated(pid: number, offset: number = 0, length?: number): PaginatedOutputResult | null {
    // First check active sessions
    const session = this.sessions.get(pid);
    if (session) {
      return this.readFromLineBuffer(
        session.outputLines,
        offset,
        length,
        session.lastReadIndex,
        (newIndex) => {
          session.lastReadIndex = newIndex;
        },
        false,
        session.discardedLineCount,
        undefined,
      );
    }
    // Then check completed sessions
    const cmplSess = this.completedSessions.get(pid);
    if (cmplSess) {
      const runtimeMs = cmplSess.endTime.getTime() - cmplSess.startTime.getTime();
      return this.readFromLineBuffer(
        cmplSess.outputLines,
        offset,
        length,
        0, // Completed sessions don't track read position
        () => {}, // No-op for completed sessions
        true,
        cmplSess.discardedLineCount,
        cmplSess.exitCode,
        runtimeMs,
      );
    }
    return null;
  }

  // 7. Read from line buffer ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private readFromLineBuffer(lines: string[], offset: number, length: number | undefined, lstRdIdx: number, updtLstRd: (index: number) => void, isComplete: boolean, dscrLnCnt: number, exitCode?: number | null, runtimeMs?: number): PaginatedOutputResult {
    const totalLines = lines.length;
    let startIndex: number;
    let linesToRead: string[];

    if (offset < 0) {
      // Negative offset = start position from end, then read 'length' lines forward
      // e.g., offset=-50, length=10 means: start 50 lines from end, read 10 lines
      const fromEnd = Math.abs(offset);
      startIndex = Math.max(0, totalLines - fromEnd);
      linesToRead = length === undefined ? lines.slice(startIndex) : lines.slice(startIndex, startIndex + length);
      // Don't update lastReadIndex for tail reads
    }
    else if (offset === 0) {
      // offset=0 means "from where I last read" (like getNewOutput)
      startIndex = lstRdIdx;
      linesToRead = length === undefined ? lines.slice(startIndex) : lines.slice(startIndex, startIndex + length);
      // Update lastReadIndex for "new output" behavior
      updtLstRd(Math.min(startIndex + linesToRead.length, totalLines));
    }
    else {
      // Positive offset = absolute position
      startIndex = offset;
      linesToRead = length === undefined ? lines.slice(startIndex) : lines.slice(startIndex, startIndex + length);
      // Don't update lastReadIndex for absolute position reads
    }
    const readCount = linesToRead.length;
    const endIndex = startIndex + readCount;
    const remaining = Math.max(0, totalLines - endIndex);

    return {
      discardedLineCount: dscrLnCnt,
      exitCode,
      isComplete,
      lines: linesToRead,
      readCount,
      readFrom: startIndex,
      remaining,
      runtimeMs,
      totalLines,
    };
  }

  // 7. Get total line count for a process ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getOutputLineCount(pid: number): number | null {
    const session = this.sessions.get(pid);
    if (session) {
      return session.outputLines.length;
    }
    const cmplSess = this.completedSessions.get(pid);
    if (cmplSess) {
      return cmplSess.outputLines.length;
    }
    return null;
  }

  // 8. Legacy method for backward compatibility ―――――――――――――――――――――――――――――――――――――――――――――――――――
  // Returns all new output since last read
  // @param maxLines Maximum lines to return. Omit to read all new output.
  // @deprecated Use readOutputPaginated instead

  // 12. Get new output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getNewOutput(pid: number, maxLines?: number): string | null {
    const result = this.readOutputPaginated(pid, 0, maxLines);
    if (!result) {
      return null;
    }
    const output = result.lines.join("\n").trim();

    // For completed sessions, append completion info with runtime
    if (result.isComplete) {
      const runtimeStr = result.runtimeMs !== undefined ? `\nRuntime: ${(result.runtimeMs / 1000).toFixed(2)}s` : "";
      if (output) {
        return `${output}\n\nProcess completed with exit code ${result.exitCode}${runtimeStr}`;
      }
      else {
        return `Process completed with exit code ${result.exitCode}${runtimeStr}\n(No output produced)`;
      }
    }
    // Add truncation warning if there's more output
    if (result.remaining > 0) {
      return `${output}\n\nOutput truncated: ${result.remaining} more lines available. Use read_process_output with offset/length for full output.`;
    }
    return output || null;
  }

  // 9. Capture a snapshot of current output state for interaction tracking ――――――――――――――――――――――――
  // Used by interactWithProcess to know what output existed before sending input.

  // 13. Capture output snapshot ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  captureOutputSnapshot(pid: number): {discardedLineCount: number; totalChars: number; lineCount: number} | null {
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join("\n");
      return {
        discardedLineCount: session.discardedLineCount,
        lineCount: session.outputLines.length,
        totalChars: fullOutput.length,
      };
    }
    return null;
  }
  // Get output that appeared since a snapshot was taken.
  // This handles the case where output is appended to the last line (REPL prompts).
  // Also checks completed sessions in case process finished between snapshot and poll.

  // 14. Get output since snapshot ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getOutputSinceSnapshot(pid: number, snapshot: {discardedLineCount: number; totalChars: number; lineCount: number}): string | null {
    // Check active session first
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join("\n");
      if (session.discardedLineCount !== snapshot.discardedLineCount) {
        return fullOutput;
      }
      if (fullOutput.length <= snapshot.totalChars) {
        return ""; // No new output
      }
      return fullOutput.slice(snapshot.totalChars);
    }
    // Fallback to completed sessions - process may have finished between snapshot and poll
    const cmplSess = this.completedSessions.get(pid);
    if (cmplSess) {
      const fullOutput = cmplSess.outputLines.join("\n");
      if (cmplSess.discardedLineCount !== snapshot.discardedLineCount) {
        return fullOutput;
      }
      if (fullOutput.length <= snapshot.totalChars) {
        return ""; // No new output
      }
      return fullOutput.slice(snapshot.totalChars);
    }
    return null;
  }

  // 10. Get a session by PID ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // @param pid Process ID
  // @returns The session or undefined if not found

  // 15. Get session ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getSession(pid: number): TrmnSess | undefined {
    return this.sessions.get(pid);
  }

  // 16. Force terminate ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  forceTerminate(pid: number): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }
    try {
      session.process.kill("SIGINT");
      setTimeout(() => {
        if (this.sessions.has(pid)) {
          session.process.kill("SIGKILL");
        }
      }, 1000);
      return true;
    }
    catch (_error) {
      return false;
    }
  }

  // 17. List active sessions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  listActiveSessions(): ActvSess[] {
    const now = new Date();
    return Array.from(this.sessions.values()).map((session) => ({
      isBlocked: session.isBlocked,
      pid: session.pid,
      runtime: now.getTime() - session.startTime.getTime(),
    }));
  }

  // 18. List completed sessions ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  listCompletedSessions(): CompletedSession[] {
    return Array.from(this.completedSessions.values());
  }
}
export const trmnMgr = new TerminalManager();
