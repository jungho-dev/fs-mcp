/**
 * @file src/features/process/process-runner.ts
 * @description Process execution runner.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {platform} from "node:os";
import type {OutputEvent, ServerResult, TimingInfo} from "@assets/type/common";
import {capture} from "@cores/runtime/runtime-output-capture";
import {configManager} from "@features/config/config-store";
import {commandManager} from "@features/process/process-command-policy";
import {analyzeProcessState, cleanProcessOutput, formatProcessStateMessage, type ProcessState} from "@features/process/process-repl-detector";
import {terminalManager} from "@features/process/process-terminal-service";
import {clearVirtualNodeSession, executeVirtualNodeCode, getVirtualNodeSession, listVirtualNodeSessions, startVirtualNodeSession} from "@features/process/process-virtual-node-session";
import {ForceTerminateArgsSchema, InteractWithProcessArgsSchema, ReadProcessOutputArgsSchema, StartProcessArgsSchema} from "@schemas/schemas-process";

type DiagnosticExitReason = TimingInfo["exitReason"] | "process_finished" | "no_wait";
type DiagnosticTimingInfo = Omit<TimingInfo, "exitReason"> & {
  exitReason: DiagnosticExitReason;
};

// 1. Start a new process (renamed from execute_command) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Includes early detection of process waiting for input
// 1. Start process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function startProcess(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    capture("server_start_process_failed");
    return {
      content: [{text: `Error: Invalid arguments for start_process: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  try {
    const commands = commandManager.extractCommands(parsed.data.command).join(", ");
    capture("server_start_process", {
      command: commandManager.getBaseCommand(parsed.data.command),
      commands: commands,
    });
  }
  catch (_error) {
    capture("server_start_process", {
      command: commandManager.getBaseCommand(parsed.data.command),
    });
  }
  const isAllowed = await commandManager.validateCommand(parsed.data.command);
  if (!isAllowed) {
    return {
      content: [{text: `Error: Command not allowed: ${parsed.data.command}`, type: "text" }],
      isError: true,
    };
  }
  const commandToRun = parsed.data.command;

  // Handle node:local - runs Node.js code directly on MCP server
  if (commandToRun.trim() === "node:local") {
  	return startVirtualNodeSession(parsed.data.timeout_ms || 30_000);
  }
  let shellUsed: string | undefined = parsed.data.shell;

  if (!shellUsed) {
    const config = await configManager.getConfig();
    if (config.defaultShell) {
    	shellUsed = config.defaultShell;
    }
    else {
      const isWindows = platform() === "win32";
      if (isWindows && process.env.COMSPEC) {
      	shellUsed = process.env.COMSPEC;
      }
      else if (!isWindows && process.env.SHELL) {
      	shellUsed = process.env.SHELL;
      }
      else {
      	shellUsed = isWindows ? "cmd.exe" : "/bin/sh";
      }
    }
  }
  const result = await terminalManager.executeCommand(commandToRun, parsed.data.timeout_ms, shellUsed, parsed.data.verbose_timing || false);

  if (result.pid === -1) {
    return {
      content: [{text: result.output, type: "text" }],
      isError: true,
    };
  }
  // Analyze the process state to detect if it's waiting for input
  const processState = analyzeProcessState(result.output, result.pid);

  let statusMessage = "";
  if (processState.isWaitingForInput) {
    statusMessage = `\n${formatProcessStateMessage(processState, result.pid)}`;
  }
  else if (processState.isFinished) {
    statusMessage = `\n${formatProcessStateMessage(processState, result.pid)}`;
  }
  else if (result.isBlocked) {
  	statusMessage = "\nProcess is running. Use read_process_output to get more output.";
  }
  // Add timing information if requested
  let timingMessage = "";
  if (result.timingInfo) {
  	timingMessage = formatTimingInfo(result.timingInfo);
  }
  return {
    content: [
      {
        text: formatStartProcessMessage(result.pid, shellUsed, result.output, statusMessage, timingMessage),
        type: "text",
      },
    ],
  };
}
// 2. Format initial output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatInitialOutput(output: string): string {
  const normalizedOutput = output
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\n+|\n+$/g, "");

  return normalizedOutput || "(no initial output)";
}
// 3. Format start process message ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatStartProcessMessage(pid: number, shell: string | undefined, output: string, statusMessage: string, timingMessage: string): string {
  const messageParts = [`Process started with PID ${pid}`, `PID: ${pid}`, `Shell: ${shell ?? "(default)"}`, "", "Output:", formatInitialOutput(output)];

  if (statusMessage.trim()) {
  	messageParts.push("", statusMessage.trim());
  }
  if (timingMessage.trim()) {
  	messageParts.push("", timingMessage.trim());
  }
  return messageParts.join("\n");
}
// 4. Format timing info ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatTimingInfo(timing: DiagnosticTimingInfo): string {
  let msg = "\n\nTiming Information:\n";
  msg += `  Exit Reason: ${timing.exitReason}\n`;
  msg += `  Total Duration: ${timing.totalDurationMs}ms\n`;

  if (timing.timeToFirstOutputMs !== undefined) {
    msg += `  Time to First Output: ${timing.timeToFirstOutputMs}ms\n`;
  }
  if (timing.firstOutputTime && timing.lastOutputTime) {
    msg += `  Output Window: ${timing.lastOutputTime - timing.firstOutputTime}ms\n`;
  }
  if (timing.outputEvents && timing.outputEvents.length > 0) {
    msg += `\n  Output Events (${timing.outputEvents.length} total):\n`;
    timing.outputEvents.forEach((event: OutputEvent, idx: number) => {
      msg += `    [${idx + 1}] +${event.deltaMs}ms | ${event.source} | ${event.length}b`;
      if (event.matchedPattern) {
        msg += ` | ${event.matchedPattern}`;
      }
      msg += `\n       "${event.snippet}"\n`;
    });
  }
  return msg;
}
// 2. Read output from a running process with file-like pagination ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Supports offset/length parameters for controlled reading
// 5. Read process output ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function readProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{text: `Error: Invalid arguments for read_process_output: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  const {
    pid,
    timeout_ms = 5000,
    offset = 0, // 0 = from last read, positive = absolute, negative = tail
    length,
    verbose_timing = false,
  } = parsed.data;

  // Timing diagnostics
  const startTime = Date.now();

  // For active sessions with no new output yet, optionally wait for output
  const session = terminalManager.getSession(pid);
  if (session && offset === 0) {
    // Wait for new output to arrive (only for "new output" reads, not absolute/tail)
    const waitForOutput = (): Promise<void> => {
      return new Promise((resolve) => {
        // Check if there's already new output
        const currentLines = terminalManager.getOutputLineCount(pid) || 0;
        if (currentLines > session.lastReadIndex) {
        	resolve();
          return;
        }
        let resolved = false;
        let interval: NodeJS.Timeout | null = null;
        let timeout: NodeJS.Timeout | null = null;

        const cleanup = () => {
          if (interval) {
          	clearInterval(interval);
          }
          if (timeout) {
          	clearTimeout(timeout);
          }
        };

        const resolveOnce = () => {
          if (resolved) {
          	return;
          }
          resolved = true;
          cleanup();
          resolve();
        };

        // Poll for new output
        interval = setInterval(() => {
          const newLineCount = terminalManager.getOutputLineCount(pid) || 0;
          if (newLineCount > session.lastReadIndex) {
          	resolveOnce();
          }
        }, 50);

        // Timeout
        timeout = setTimeout(() => {
          resolveOnce();
        }, timeout_ms);
      });
    };

    await waitForOutput();
  }
  // Read output with pagination
  const result = terminalManager.readOutputPaginated(pid, offset, length);

  if (!result) {
    return {
      content: [{text: `No session found for PID ${pid}`, type: "text" }],
      isError: true,
    };
  }
  // Join lines back into string
  const output = result.lines.join("\n");

  // Generate status message similar to file reading
  let statusMessage = "";
  if (offset < 0) {
    // Tail read - match file reading format for consistency
    statusMessage = `Reading last ${result.readCount} lines (total: ${result.totalLines} lines)`;
  }
  else if (offset === 0) {
    // "New output" read
    if (result.remaining > 0) {
      statusMessage = `Reading ${result.readCount} new lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)`;
    }
    else {
      statusMessage = `Reading ${result.readCount} new lines (total: ${result.totalLines} lines)`;
    }
  }
  else {
    // Absolute position read
    statusMessage = `Reading ${result.readCount} lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)`;
  }
  // Add process state info
  let processStateMessage = "";
  if (result.isComplete) {
    const runtimeStr = result.runtimeMs !== undefined ? ` (runtime: ${(result.runtimeMs / 1000).toFixed(2)}s)` : "";
    processStateMessage = `\nProcess completed with exit code ${result.exitCode}${runtimeStr}`;
  }
  else if (session) {
    // Analyze state for running processes
    const fullOutput = session.outputLines.join("\n");
    const processState = analyzeProcessState(fullOutput, pid);
    if (processState.isWaitingForInput) {
      processStateMessage = `\n${formatProcessStateMessage(processState, pid)}`;
    }
  }
  // Add timing information if requested
  let timingMessage = "";
  if (verbose_timing) {
    const endTime = Date.now();
    timingMessage = `\n\nTiming: ${endTime - startTime}ms`;
  }
  const responseText = output || "(No output in requested range)";

  return {
    content: [
      {
        text: `${statusMessage}\n\n${responseText}${processStateMessage}${timingMessage}`,
        type: "text",
      },
    ],
  };
}
// 3. Interact with a running process (renamed from send_input) ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Automatically detects when process is ready and returns output
// 6. Interact with process ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function interactWithProcess(args: unknown): Promise<ServerResult> {
  const parsed = InteractWithProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    capture("server_interact_with_process_failed", {
      error: "Invalid arguments",
    });
    return {
      content: [{text: `Error: Invalid arguments for interact_with_process: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  const {pid, input, timeout_ms = 8000, wait_for_prompt = true, verbose_timing = false} = parsed.data;

  // Check if this is a virtual Node session (node:local)
  const virtualNodeSession = getVirtualNodeSession(pid);
  if (virtualNodeSession) {
    capture("server_interact_with_process_node_fallback", {
      inputLength: input.length,
      pid: pid,
    });

    // Execute code via temp file approach
    // Respect per-call timeout if provided, otherwise use session default
    const effectiveTimeout = timeout_ms ?? virtualNodeSession.timeout_ms;
    return executeVirtualNodeCode(input, effectiveTimeout);
  }
  // Timing diagnostics
  const startTime = Date.now();
  let firstOutputTime: number | undefined;
  let lastOutputTime: number | undefined;
  const outputEvents: OutputEvent[] = [];
  let exitReason: "early_exit_quick_pattern" | "early_exit_periodic_check" | "process_finished" | "timeout" | "no_wait" = "timeout";

  try {
    capture("server_interact_with_process", {
      inputLength: input.length,
      pid: pid,
    });

    // Capture output snapshot BEFORE sending input
    // This handles REPLs where output is appended to the prompt line
    const outputSnapshot = terminalManager.captureOutputSnapshot(pid);

    const success = terminalManager.sendInputToProcess(pid, input);

    if (!success) {
      return {
        content: [{text: `Error: Failed to send input to process ${pid}. The process may have exited or doesn't accept input.`, type: "text" }],
        isError: true,
      };
    }
    // If not waiting for response, return immediately
    if (!wait_for_prompt) {
      exitReason = "no_wait";
      let timingMessage = "";
      if (verbose_timing) {
        const endTime = Date.now();
        const timingInfo = {
          endTime,
          exitReason,
          firstOutputTime,
          lastOutputTime,
          outputEvents: undefined,
          startTime,
          timeToFirstOutputMs: undefined,
          totalDurationMs: endTime - startTime,
        };
        timingMessage = formatTimingInfo(timingInfo);
      }
      return {
        content: [
          {
            text: `Input sent to process ${pid}. Use read_process_output to get the response.${timingMessage}`,
            type: "text",
          },
        ],
      };
    }
    // Smart waiting with immediate and periodic detection
    let output = "";
    let processState: ProcessState | undefined;
    let earlyExit = false;

    const waitForResponse = (): Promise<void> => {
      return new Promise((resolve) => {
        let resolved = false;
        let attempts = 0;
        const pollIntervalMs = 50; // Poll every 50ms for faster response
        const maxAttempts = Math.ceil(timeout_ms / pollIntervalMs);
        let interval: NodeJS.Timeout | null = null;
        let lastOutputLength = 0; // Track output length to detect new output

        const resolveOnce = () => {
          if (resolved) {
          	return;
          }
          resolved = true;
          if (interval) {
          	clearInterval(interval);
          }
          resolve();
        };

        // Fast-polling check - check every 50ms for quick responses
        interval = setInterval(() => {
          if (resolved) {
          	return;
          }
          // Use snapshot-based reading to handle REPL prompt line appending
          const newOutput = outputSnapshot ? terminalManager.getOutputSinceSnapshot(pid, outputSnapshot) : terminalManager.getNewOutput(pid);

          if (newOutput && newOutput.length > lastOutputLength) {
            const now = Date.now();
            if (!firstOutputTime) {
            	firstOutputTime = now;
            }
            lastOutputTime = now;

            if (verbose_timing) {
              outputEvents.push({
                deltaMs: now - startTime,
                length: newOutput.length - lastOutputLength,
                snippet: newOutput.slice(lastOutputLength, lastOutputLength + 50).replace(/\n/g, "\\n"),
                source: "periodic_poll",
                timestamp: now,
              });
            }
            output = newOutput; // Replace with full output since snapshot
            lastOutputLength = newOutput.length;

            // Analyze current state
            processState = analyzeProcessState(output, pid);

            // Exit early if we detect the process is waiting for input
            if (processState.isWaitingForInput) {
              earlyExit = true;
              exitReason = "early_exit_periodic_check";

              if (verbose_timing && outputEvents.length > 0) {
                const lastOutputEvent = outputEvents.at(-1);
                if (lastOutputEvent) {
                	lastOutputEvent.matchedPattern = "periodic_check";
                }
              }
              resolveOnce();
              return;
            }
            // Also exit if process finished
            if (processState.isFinished) {
            	exitReason = "process_finished";
              resolveOnce();
              return;
            }
          }
          attempts++;
          if (attempts >= maxAttempts) {
          	exitReason = "timeout";
            resolveOnce();
          }
        }, pollIntervalMs);
      });
    };

    await waitForResponse();

    // Clean and format output
    let cleanOutput = cleanProcessOutput(output, input);
    const timeoutReached = !earlyExit && !processState?.isFinished && !processState?.isWaitingForInput;

    // Apply output line limit to prevent context overflow
    let truncationMessage = "";
    const outputLines = cleanOutput.split("\n");
    if (outputLines.length > maxOutputLines) {
      const truncatedLines = outputLines.slice(0, maxOutputLines);
      cleanOutput = truncatedLines.join("\n");
      const remainingLines = outputLines.length - maxOutputLines;
      truncationMessage = `\n\nOutput truncated: showing ${maxOutputLines} of ${outputLines.length} lines (${remainingLines} hidden). Use read_process_output with offset/length for full output.`;
    }
    // Determine final state
    if (!processState) {
    	processState = analyzeProcessState(output, pid);
    }
    let statusMessage = "";
    if (processState.isWaitingForInput) {
      statusMessage = `\n${formatProcessStateMessage(processState, pid)}`;
    }
    else if (processState.isFinished) {
      statusMessage = `\n${formatProcessStateMessage(processState, pid)}`;
    }
    else if (timeoutReached) {
    	statusMessage = "\nResponse may be incomplete (timeout reached)";
    }
    // Add timing information if requested
    let timingMessage = "";
    if (verbose_timing) {
      const endTime = Date.now();
      const timingInfo = {
        endTime,
        exitReason,
        firstOutputTime,
        lastOutputTime,
        outputEvents: outputEvents.length > 0 ? outputEvents : undefined,
        startTime,
        timeToFirstOutputMs: firstOutputTime ? firstOutputTime - startTime : undefined,
        totalDurationMs: endTime - startTime,
      };
      timingMessage = formatTimingInfo(timingInfo);
    }
    if (cleanOutput.trim().length === 0 && !timeoutReached) {
      return {
        content: [
          {
            text: `Input executed in process ${pid}.\n(No output produced)${statusMessage}${timingMessage}`,
            type: "text",
          },
        ],
      };
    }
    // Format response with better structure and consistent status symbols
    let responseText = `Input executed in process ${pid}`;

    if (cleanOutput && cleanOutput.trim().length > 0) {
      responseText += `:\n\nOutput:\n${cleanOutput}`;
    }
    else {
    	responseText += `.\n(No output produced)`;
    }
    if (statusMessage) {
      responseText += `\n\n${statusMessage}`;
    }
    if (truncationMessage) {
    	responseText += truncationMessage;
    }
    if (timingMessage) {
    	responseText += timingMessage;
    }
    return {
      content: [
        {
          text: responseText,
          type: "text",
        },
      ],
    };
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    capture("server_interact_with_process_error", {
      error: errorMessage,
    });
    return {
      content: [{text: `Error interacting with process: ${errorMessage}`, type: "text" }],
      isError: true,
    };
  }
}
// 7. Force terminate ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function forceTerminate(args: unknown): Promise<ServerResult> {
  const parsed = ForceTerminateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{text: `Error: Invalid arguments for force_terminate: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  const pid = parsed.data.pid;

  // Handle virtual Node.js sessions (node:local)
  if (clearVirtualNodeSession(pid)) {
    return {
      content: [
        {
          text: `Cleared virtual Node.js session ${pid}`,
          type: "text",
        },
      ],
    };
  }
  const success = terminalManager.forceTerminate(pid);
  return {
    content: [
      {
        text: success ? `Successfully initiated termination of session ${pid}` : `No active session found for PID ${pid}`,
        type: "text",
      },
    ],
  };
}
// 8. List sessions ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function listSessions(): Promise<ServerResult> {
  const sessions = terminalManager.listActiveSessions();

  // Include virtual Node.js sessions
  const virtualSessions = listVirtualNodeSessions();

  const realSessionsText = sessions.map((s) => `PID: ${s.pid}, Blocked: ${s.isBlocked}, Runtime: ${Math.round(s.runtime / 1000)}s`);

  const virtualSessionsText = virtualSessions.map((s) => `PID: ${s.pid} (node:local), Timeout: ${s.timeout_ms}ms`);

  const allSessions = [...realSessionsText, ...virtualSessionsText];

  return {
    content: [
      {
        text: allSessions.length === 0 ? "No active sessions" : allSessions.join("\n"),
        type: "text",
      },
    ],
  };
}
