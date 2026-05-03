/**
 * @file src/features/process/process-terminal-service.ts
 * @description Terminal session service.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {type SpawnOptions, spawn} from "node:child_process";
import os from "node:os";
import path from "node:path";
import type {ActiveSession, CommandExecutionResult, OutputEvent, TerminalSession, TimingInfo} from "@assets/type/common";
import {capture} from "@cores/runtime/runtime-output-capture";
import {DEFAULT_COMMAND_TIMEOUT} from "@features/config/config-paths";
import {configManager} from "@features/config/config-store";
import {analyzeProcessState} from "@features/process/process-repl-detector";

interface CompletedSession {
  endTime: Date;
  exitCode: number | null;
  outputLines: string[]; // Line-based buffer (consistent with active sessions)
  pid: number;
  startTime: Date;
}

// Result type for paginated output reading
export interface PaginatedOutputResult {
  exitCode?: number | null; // Exit code if completed
  isComplete: boolean; // Whether process has finished
  lines: string[];
  readCount: number; // Number of lines returned
  readFrom: number; // Starting line of this read
  remaining: number; // Lines remaining after this read
  runtimeMs?: number; // Runtime in milliseconds (for completed processes)
  totalLines: number;
}
// 1. Configuration for spawning a shell with appropriate flags ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
interface ShellSpawnConfig {
  args: string[];
  executable: string;
  useShellOption: string | boolean;
}
function splitShellCommand(shellCommand: string): string[] {
  const matches = shellCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  const parts = matches ?? [shellCommand];

  return parts.map((part) => {
    const isQuoted = (part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"));

    return isQuoted ? part.slice(1, -1) : part;
  });
}
function appendCommandArgument(args: string[], commandFlags: string[], command: string, defaultFlag: string): string[] {
  const commandFlagIndex = args.findIndex((arg) => commandFlags.includes(arg.toLowerCase()));
  const commandArgs = commandFlagIndex === -1 ? [...args, defaultFlag, command] : [...args.slice(0, commandFlagIndex + 1), command, ...args.slice(commandFlagIndex + 1)];

  return commandArgs;
}
function withPwshOutputEncoding(command: string): string {
  const outputEncodingCommand = "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);";
  const encodedCommand = command.includes("[Console]::OutputEncoding") ? command : `${outputEncodingCommand} ${command}`;

  return encodedCommand;
}
// 2. Get the appropriate spawn configuration for a given shell ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// This handles login shell flags for different shell types
function getShellSpawnArgs(shellPath: string, command: string): ShellSpawnConfig {
  const [shellExecutable, ...shellArgs] = splitShellCommand(shellPath);
  const executable = shellExecutable ?? shellPath;
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
export class TerminalManager {
  private readonly sessions: Map<number, TerminalSession> = new Map();
  private readonly completedSessions: Map<number, CompletedSession> = new Map();

  // 3. Send input to a running process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // @param pid Process ID
  // @param input Text to send to the process
  // @returns Whether input was successfully sent
  sendInputToProcess(pid: number, input: string): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
    	return false;
    }
    try {
      if (session.process.stdin && !session.process.stdin.destroyed) {
        // Ensure input ends with a newline for most REPLs
        const inputWithNewline = input.endsWith("\n") ? input : `${input}\n`;
        session.process.stdin.write(inputWithNewline);
        return true;
      }
      return false;
    }
    catch (error) {
      console.error(`Error sending input to process ${pid}:`, error);
      return false;
    }
  }
  async executeCommand(command: string, timeoutMs: number = DEFAULT_COMMAND_TIMEOUT, shell?: string, collectTiming: boolean = false): Promise<CommandExecutionResult> {
    // Get the shell from config if not specified
    let shellToUse: string | boolean | undefined = shell;
    if (!shellToUse) {
      try {
        const config = await configManager.getConfig();
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
    let enhancedCommand = command;
    if (command.trim().startsWith("ssh ") && !command.includes(" -t")) {
      enhancedCommand = command.replace(/^ssh /, "ssh -t ");
      console.log(`Enhanced SSH command: ${enhancedCommand}`);
    }
    // Get the appropriate spawn configuration for the shell
    let spawnConfig: ShellSpawnConfig;
    let spawnOptions: SpawnOptions;

    if (typeof shellToUse === "string") {
      // Use shell-specific configuration with login flags where appropriate
      spawnConfig = getShellSpawnArgs(shellToUse, enhancedCommand);
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
        executable: enhancedCommand,
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
    const session: TerminalSession = {
      isBlocked: false,
      lastReadIndex: 0, // Track where "new" output starts
      outputLines: [], // Line-based buffer
      pid: childProcess.pid,
      process: childProcess,
      startTime: new Date(),
    };

    this.sessions.set(childProcess.pid, session);

    // Timing diagnostics
    const startTime = Date.now();
    let firstOutputTime: number | undefined;
    let lastOutputTime: number | undefined;
    const outputEvents: OutputEvent[] = [];
    let exitReason: TimingInfo["exitReason"] = "timeout";

    return new Promise((resolve) => {
      let resolved = false;
      let periodicCheck: NodeJS.Timeout | null = null;

      // Quick prompt patterns for immediate detection
      const quickPromptPatterns = />>>\s*$|>\s*$|\$\s*$|#\s*$/;

      const resolveOnce = (result: CommandExecutionResult) => {
        if (resolved) {
        	return;
        }
        resolved = true;
        if (periodicCheck) {
        	clearInterval(periodicCheck);
        }
        // Add timing info if requested
        if (collectTiming) {
          const endTime = Date.now();
          result.timingInfo = {
            endTime,
            exitReason,
            firstOutputTime,
            lastOutputTime,
            outputEvents: outputEvents.length > 0 ? outputEvents : undefined,
            startTime,
            timeToFirstOutputMs: firstOutputTime ? firstOutputTime - startTime : undefined,
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

        if (!firstOutputTime) {
        	firstOutputTime = now;
        }
        lastOutputTime = now;

        output += text;
        // Append to line-based buffer
        this.appendToLineBuffer(session, text);

        // Record output event if collecting timing
        if (collectTiming) {
          outputEvents.push({
            deltaMs: now - startTime,
            length: text.length,
            snippet: text.slice(0, 50).replace(/\n/g, "\\n"),
            source: "stdout",
            timestamp: now,
          });
        }
        // Immediate check for obvious prompts
        if (quickPromptPatterns.test(text)) {
          session.isBlocked = true;
          exitReason = "early_exit_quick_pattern";

          if (collectTiming && outputEvents.length > 0) {
            const lastOutputEvent = outputEvents.at(-1);
            if (lastOutputEvent) {
            	lastOutputEvent.matchedPattern = "quick_pattern";
            }
          }
          resolveOnce({
            isBlocked: true,
            output,
            pid: childProcess.pid!,
          });
        }
      });

      stderr.on("data", (data: Buffer | string) => {
        const text = data.toString();
        const now = Date.now();

        if (!firstOutputTime) {
        	firstOutputTime = now;
        }
        lastOutputTime = now;

        output += text;
        // Append to line-based buffer
        this.appendToLineBuffer(session, text);

        // Record output event if collecting timing
        if (collectTiming) {
          outputEvents.push({
            deltaMs: now - startTime,
            length: text.length,
            snippet: text.slice(0, 50).replace(/\n/g, "\\n"),
            source: "stderr",
            timestamp: now,
          });
        }
      });

      // Periodic comprehensive check every 100ms
      periodicCheck = setInterval(() => {
        if (output.trim()) {
          const processState = analyzeProcessState(output, childProcess.pid);
          if (processState.isWaitingForInput) {
            session.isBlocked = true;
            exitReason = "early_exit_periodic_check";
            resolveOnce({
              isBlocked: true,
              output,
              pid: childProcess.pid!,
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
          pid: childProcess.pid!,
        });
      }, timeoutMs);

      childProcess.on("exit", (code: number | null) => {
        if (childProcess.pid) {
          // Store completed session before removing active session
          this.completedSessions.set(childProcess.pid, {
            endTime: new Date(),
            exitCode: code,
            outputLines: [...session.outputLines], // Copy line buffer
            pid: childProcess.pid,
            startTime: session.startTime,
          });

          // Keep only last 100 completed sessions
          if (this.completedSessions.size > 100) {
          	const oldestKey = Array.from(this.completedSessions.keys())[0];
            this.completedSessions.delete(oldestKey);
          }
          this.sessions.delete(childProcess.pid);
        }
        exitReason = "process_exit";
        resolveOnce({
          isBlocked: false,
          output,
          pid: childProcess.pid!,
        });
      });
    });
  }
  // 4. Append text to a session's line buffer ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Handles partial lines and newline splitting
  private appendToLineBuffer(session: TerminalSession, text: string): void {
    if (!text) {
    	return;
    }
    // Split text into lines, keeping track of whether text ends with newline
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const _isLastFragment = i === lines.length - 1;
      const _endsWithNewline = text.endsWith("\n");

      if (session.outputLines.length === 0) {
      	// First line ever
        session.outputLines.push(line);
      }
      else if (i === 0) {
      	// First fragment - append to last line (might be partial)
        session.outputLines[session.outputLines.length - 1] += line;
      }
      else {
      	// Subsequent lines - add as new lines
        session.outputLines.push(line);
      }
    }
  }
  // 5. Read process output with pagination (like file reading) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // @param pid Process ID
  // @param offset Line offset: 0=from lastReadIndex, positive=absolute, negative=tail
  // @param length Max lines to return
  // @param updateReadIndex Whether to update lastReadIndex (default: true for offset=0)
  readOutputPaginated(pid: number, offset: number = 0, length: number = 1000): PaginatedOutputResult | null {
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
        undefined,
      );
    }
    // Then check completed sessions
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      const runtimeMs = completedSession.endTime.getTime() - completedSession.startTime.getTime();
      return this.readFromLineBuffer(
        completedSession.outputLines,
        offset,
        length,
        0, // Completed sessions don't track read position
        () => {}, // No-op for completed sessions
        true,
        completedSession.exitCode,
        runtimeMs,
      );
    }
    return null;
  }
  // 6. Internal helper to read from a line buffer with offset/length ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private readFromLineBuffer(lines: string[], offset: number, length: number, lastReadIndex: number, updateLastRead: (index: number) => void, isComplete: boolean, exitCode?: number | null, runtimeMs?: number): PaginatedOutputResult {
    const totalLines = lines.length;
    let startIndex: number;
    let linesToRead: string[];

    if (offset < 0) {
    	// Negative offset = start position from end, then read 'length' lines forward
      // e.g., offset=-50, length=10 means: start 50 lines from end, read 10 lines
      const fromEnd = Math.abs(offset);
      startIndex = Math.max(0, totalLines - fromEnd);
      linesToRead = lines.slice(startIndex, startIndex + length);
      // Don't update lastReadIndex for tail reads
    }
    else if (offset === 0) {
    	// offset=0 means "from where I last read" (like getNewOutput)
      startIndex = lastReadIndex;
      linesToRead = lines.slice(startIndex, startIndex + length);
      // Update lastReadIndex for "new output" behavior
      updateLastRead(Math.min(startIndex + linesToRead.length, totalLines));
    }
    else {
    	// Positive offset = absolute position
      startIndex = offset;
      linesToRead = lines.slice(startIndex, startIndex + length);
      // Don't update lastReadIndex for absolute position reads
    }
    const readCount = linesToRead.length;
    const endIndex = startIndex + readCount;
    const remaining = Math.max(0, totalLines - endIndex);

    return {
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
  // 7. Get total line count for a process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getOutputLineCount(pid: number): number | null {
    const session = this.sessions.get(pid);
    if (session) {
    	return session.outputLines.length;
    }
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
    	return completedSession.outputLines.length;
    }
    return null;
  }
  // 8. Legacy method for backward compatibility ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Returns all new output since last read
  // @param maxLines Maximum lines to return (default: 1000 for context protection)
  // @deprecated Use readOutputPaginated instead
  getNewOutput(pid: number, maxLines: number = 1000): string | null {
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
  // 9. Capture a snapshot of current output state for interaction tracking ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // Used by interactWithProcess to know what output existed before sending input.
  captureOutputSnapshot(pid: number): {totalChars: number; lineCount: number} | null {
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join("\n");
      return {
        lineCount: session.outputLines.length,
        totalChars: fullOutput.length,
      };
    }
    return null;
  }
  // Get output that appeared since a snapshot was taken.
  // This handles the case where output is appended to the last line (REPL prompts).
  // Also checks completed sessions in case process finished between snapshot and poll.
  getOutputSinceSnapshot(pid: number, snapshot: {totalChars: number; lineCount: number}): string | null {
    // Check active session first
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join("\n");
      if (fullOutput.length <= snapshot.totalChars) {
      	return ""; // No new output
      }
      return fullOutput.slice(snapshot.totalChars);
    }
    // Fallback to completed sessions - process may have finished between snapshot and poll
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      const fullOutput = completedSession.outputLines.join("\n");
      if (fullOutput.length <= snapshot.totalChars) {
      	return ""; // No new output
      }
      return fullOutput.slice(snapshot.totalChars);
    }
    return null;
  }
  // 10. Get a session by PID ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  // @param pid Process ID
  // @returns The session or undefined if not found
  getSession(pid: number): TerminalSession | undefined {
    return this.sessions.get(pid);
  }
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
    catch (error) {
      // Convert error to string, handling both Error objects and other types
      const errorMessage = error instanceof Error ? error.message : String(error);
      capture("server_request_error", {error: errorMessage, message: `Failed to terminate process ${pid}:`});
      return false;
    }
  }
  listActiveSessions(): ActiveSession[] {
    const now = new Date();
    return Array.from(this.sessions.values()).map((session) => ({
      isBlocked: session.isBlocked,
      pid: session.pid,
      runtime: now.getTime() - session.startTime.getTime(),
    }));
  }
  listCompletedSessions(): CompletedSession[] {
    return Array.from(this.completedSessions.values());
  }
}
export const terminalManager = new TerminalManager();
