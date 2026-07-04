/**
 * @file src/features/process/process-runner.ts
 * @description Process execution runner.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {platform} from "node:os";
import type {OutputEvent, ServerResult, TimingInfo} from "@assets/type/common";
import {cfgMgr} from "@features/config/config-store";
import {readFileInternal as rdFlInt} from "@features/filesystem/filesystem-service";
import {cmdMgr2} from "@features/process/process-command-policy";
import {analyzeProcessState as anlyProcSt, cleanProcessOutput as clnProcOtpt, formatProcessStateMessage as frmPrStMs, type ProcessState} from "@features/process/process-repl-detector";
import {trmnMgr} from "@features/process/process-terminal-service";
import {clearVirtualNodeSession as clrVrNdSe, executeVirtualNodeCode as exctVrtlNdCd, getVirtualNodeSession as gtVrtlNdSess, listVirtualNodeSessions as lstVrNdSs, startVirtualNodeSession as strVrNdSe} from "@features/process/process-virtual-node-session";
import {FrcTrArSc, IntWtPrArSc2, RdPrOtArSc, StrPrArSc} from "@schemas/schemas-process";

type DiagnosticExitReason = TimingInfo["exitReason"] | "process_finished" | "no_wait";
type DiagnosticTimingInfo = Omit<TimingInfo, "exitReason"> & {
  exitReason: DiagnosticExitReason;
};
const PSAWC = 120_000;
const PSAWL = 5000;

// 1. Resolve process text argument ----------------------------------------------------------------
async function resolveProcessTextArgument(value: string | undefined, filePath: string | undefined, offset: number, length: number | undefined, label: string): Promise<string> {
  if (value !== undefined) {
    return value;
  }
  if (filePath === undefined) {
    throw new Error(`${label} or ${label}_path is required`);
  }
  return rdFlInt(filePath, offset, length);
}

// 1. Start a new process (renamed from execute_command) -------------------------------------------
// Includes early detection of process waiting for input
// 1. Start process --------------------------------------------------------------------------------
export async function startProcess(args: unknown): Promise<ServerResult> {
  const parsed = StrPrArSc.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{text: `Error: Invalid arguments for start_process: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  let commandToRun: string;
  try {
    commandToRun = await resolveProcessTextArgument(parsed.data.command, parsed.data.command_path, parsed.data.command_offset, parsed.data.command_length, "command");
  }
  catch (error) {
    return {
      content: [{text: `Error: ${error instanceof Error ? error.message : String(error)}`, type: "text" }],
      isError: true,
    };
  }
  const isAllowed = await cmdMgr2.validateCommand(commandToRun);
  if (!isAllowed) {
    return {
      content: [{text: `Error: Command not allowed: ${commandToRun}`, type: "text" }],
      isError: true,
    };
  }

  // Handle node:local - runs Node.js code directly on MCP server
  if (commandToRun.trim() === "node:local") {
    return strVrNdSe(parsed.data.timeout_ms || 30_000);
  }
  let shellUsed: string | undefined = parsed.data.shell;

  if (!shellUsed) {
    const config = await cfgMgr.getConfig();
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
  const result = await trmnMgr.executeCommand(commandToRun, parsed.data.timeout_ms, shellUsed, parsed.data.verbose_timing || false);

  if (result.pid === -1) {
    return {
      content: [{text: result.output, type: "text" }],
      isError: true,
    };
  }
  // Analyze the process state to detect if it's waiting for input
  const processState = anlyProcSt(result.output.slice(-PSAWC), result.pid);

  let statMsg = "";
  if (processState.isWaitingForInput) {
    statMsg = `\n${frmPrStMs(processState, result.pid)}`;
  }
  else if (processState.isFinished) {
    statMsg = `\n${frmPrStMs(processState, result.pid)}`;
  }
  else if (result.isBlocked) {
    statMsg = "\nProcess is running. Use read_process_output to get more output.";
  }
  // Add timing information if requested
  let tmngMsg = "";
  if (result.timingInfo) {
    tmngMsg = formatTimingInfo(result.timingInfo);
  }
  return {
    content: [
      {
        text: formatStartProcessMessage(result.pid, shellUsed, result.output, statMsg, tmngMsg),
        type: "text",
      },
    ],
  };
}

// 2. Format initial output ------------------------------------------------------------------------
function formatInitialOutput(output: string): string {
  const normOtpt = output
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\n+|\n+$/g, "");

  return normOtpt || "(no initial output)";
}

// 3. Format start process message -----------------------------------------------------------------
function formatStartProcessMessage(pid: number, shell: string | undefined, output: string, statMsg: string, tmngMsg: string): string {
  const messageParts = [`Process started with PID ${pid}`, `PID: ${pid}`, `Shell: ${shell ?? "(default)"}`, "", "Output:", formatInitialOutput(output)];

  if (statMsg.trim()) {
    messageParts.push("", statMsg.trim());
  }
  if (tmngMsg.trim()) {
    messageParts.push("", tmngMsg.trim());
  }
  return messageParts.join("\n");
}

// 4. Format timing info ---------------------------------------------------------------------------
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

// 2. Read output from a running process with file-like pagination ---------------------------------
// Supports offset/length parameters for controlled reading
// 5. Read process output --------------------------------------------------------------------------
export async function readProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = RdPrOtArSc.safeParse(args);
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
    verbose_timing: vrbsTmng = false,
  } = parsed.data;

  // Timing diagnostics
  const startTime = Date.now();

  // For active sessions with no new output yet, optionally wait for output
  const session = trmnMgr.getSession(pid);
  if (session && offset === 0) {
    // Wait for new output to arrive (only for "new output" reads, not absolute/tail)
    const wtFrOtpt = (): Promise<void> => {
      return new Promise((resolve) => {
        // Check if there's already new output
        const currentLines = trmnMgr.getOutputLineCount(pid) || 0;
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
          const newLineCount = trmnMgr.getOutputLineCount(pid) || 0;
          if (newLineCount > session.lastReadIndex) {
            resolveOnce();
          }
        }, 100);

        // Timeout
        timeout = setTimeout(() => {
          resolveOnce();
        }, timeout_ms);
      });
    };

    await wtFrOtpt();
  }
  // Read output with pagination
  const result = trmnMgr.readOutputPaginated(pid, offset, length);

  if (!result) {
    return {
      content: [{text: `No session found for PID ${pid}`, type: "text" }],
      isError: true,
    };
  }
  // Join lines back into string
  const output = result.lines.join("\n");

  // Generate status message similar to file reading
  let statMsg = "";
  if (offset < 0) {
    // Tail read - match file reading format for consistency
    statMsg = `Reading last ${result.readCount} lines (total: ${result.totalLines} lines)`;
  }
  else if (offset === 0) {
    // "New output" read
    if (result.remaining > 0) {
      statMsg = `Reading ${result.readCount} new lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)`;
    }
    else {
      statMsg = `Reading ${result.readCount} new lines (total: ${result.totalLines} lines)`;
    }
  }
  else {
    // Absolute position read
    statMsg = `Reading ${result.readCount} lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)`;
  }
  // Add process state info
  let procStMsg = "";
  if (result.isComplete) {
    const runtimeStr = result.runtimeMs !== undefined ? ` (runtime: ${(result.runtimeMs / 1000).toFixed(2)}s)` : "";
    procStMsg = `\nProcess completed with exit code ${result.exitCode}${runtimeStr}`;
  }
  else if (session) {
    // Analyze state for running processes
    const fullOutput = session.outputLines.slice(-PSAWL).join("\n");
    const processState = anlyProcSt(fullOutput, pid);
    if (processState.isWaitingForInput) {
      procStMsg = `\n${frmPrStMs(processState, pid)}`;
    }
  }
  if (result.discardedLineCount > 0) {
    procStMsg += "\nOlder output was truncated by the session line budget.";
  }
  // Add timing information if requested
  let tmngMsg = "";
  if (vrbsTmng) {
    const endTime = Date.now();
    tmngMsg = `\n\nTiming: ${endTime - startTime}ms`;
  }
  const responseText = output || "(No output in requested range)";

  return {
    content: [
      {
        text: `${statMsg}\n\n${responseText}${procStMsg}${tmngMsg}`,
        type: "text",
      },
    ],
  };
}

// 3. Interact with a running process (renamed from send_input) ------------------------------------
// Automatically detects when process is ready and returns output
// 6. Interact with process ------------------------------------------------------------------------
export async function interactWithProcess(args: unknown): Promise<ServerResult> {
  const parsed = IntWtPrArSc2.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{text: `Error: Invalid arguments for interact_with_process: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  const {pid, timeout_ms = 8000, wait_for_prompt: wtFrPrmp = true, verbose_timing: vrbsTmng = false} = parsed.data;
  let input: string;
  try {
    input = await resolveProcessTextArgument(parsed.data.input, parsed.data.input_path, parsed.data.input_offset, parsed.data.input_length, "input");
  }
  catch (error) {
    return {
      content: [{text: `Error: ${error instanceof Error ? error.message : String(error)}`, type: "text" }],
      isError: true,
    };
  }

  // Check if this is a virtual Node session (node:local)
  const vrtlNdSess = gtVrtlNdSess(pid);
  if (vrtlNdSess) {

    // Execute code via temp file approach
    // Respect per-call timeout if provided, otherwise use session default
    const effcTmt = timeout_ms ?? vrtlNdSess.timeout_ms;
    return exctVrtlNdCd(input, effcTmt);
  }
  // Timing diagnostics
  const startTime = Date.now();
  let frstOtptTm: number | undefined;
  let lstOtptTm: number | undefined;
  const outputEvents: OutputEvent[] = [];
  let exitReason: "early_exit_quick_pattern" | "early_exit_periodic_check" | "process_finished" | "timeout" | "no_wait" = "timeout";

  try {

    // Capture output snapshot BEFORE sending input
    // This handles REPLs where output is appended to the prompt line
    const otptSnps = trmnMgr.captureOutputSnapshot(pid);

    const success = trmnMgr.sendInputToProcess(pid, input);

    if (!success) {
      return {
        content: [{text: `Error: Failed to send input to process ${pid}. The process may have exited or doesn't accept input.`, type: "text" }],
        isError: true,
      };
    }
    // If not waiting for response, return immediately
    if (!wtFrPrmp) {
      exitReason = "no_wait";
      let tmngMsg = "";
      if (vrbsTmng) {
        const endTime = Date.now();
        const timingInfo = {
          endTime,
          exitReason,
          firstOutputTime: frstOtptTm,
          lastOutputTime: lstOtptTm,
          outputEvents: undefined,
          startTime,
          timeToFirstOutputMs: undefined,
          totalDurationMs: endTime - startTime,
        };
        tmngMsg = formatTimingInfo(timingInfo);
      }
      return {
        content: [
          {
            text: `Input sent to process ${pid}. Use read_process_output to get the response.${tmngMsg}`,
            type: "text",
          },
        ],
      };
    }
    // Smart waiting with immediate and periodic detection
    let output = "";
    let processState: ProcessState | undefined;
    let earlyExit = false;

    const wtFrRes = (): Promise<void> => {
      return new Promise((resolve) => {
        let resolved = false;
        let attempts = 0;
        const pllIntrMs = 100; // Poll every 100ms to reduce idle CPU usage
        const maxAttempts = Math.ceil(timeout_ms / pllIntrMs);
        let interval: NodeJS.Timeout | null = null;
        let lstOtptLen = 0; // Track output length to detect new output

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
          const newOutput = otptSnps ? trmnMgr.getOutputSinceSnapshot(pid, otptSnps) : trmnMgr.getNewOutput(pid);

          if (newOutput && newOutput.length > lstOtptLen) {
            const now = Date.now();
            if (!frstOtptTm) {
              frstOtptTm = now;
            }
            lstOtptTm = now;

            if (vrbsTmng) {
              outputEvents.push({
                deltaMs: now - startTime,
                length: newOutput.length - lstOtptLen,
                snippet: newOutput.slice(lstOtptLen, lstOtptLen + 50).replace(/\n/g, "\\n"),
                source: "periodic_poll",
                timestamp: now,
              });
            }
            output = newOutput; // Replace with full output since snapshot
            lstOtptLen = newOutput.length;

            // Analyze current state
            processState = anlyProcSt(output.slice(-PSAWC), pid);

            // Exit early if we detect the process is waiting for input
            if (processState.isWaitingForInput) {
              earlyExit = true;
              exitReason = "early_exit_periodic_check";

              if (vrbsTmng && outputEvents.length > 0) {
                const lstOtptEvt = outputEvents.at(-1);
                if (lstOtptEvt) {
                  lstOtptEvt.matchedPattern = "periodic_check";
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
        }, pllIntrMs);
      });
    };

    await wtFrRes();

    // Clean and format output
    const cleanOutput = clnProcOtpt(output, input);
    const tmtRchd = !earlyExit && !processState?.isFinished && !processState?.isWaitingForInput;

    // Determine final state
    if (!processState) {
      processState = anlyProcSt(output.slice(-PSAWC), pid);
    }
    let statMsg = "";
    if (processState.isWaitingForInput) {
      statMsg = `\n${frmPrStMs(processState, pid)}`;
    }
    else if (processState.isFinished) {
      statMsg = `\n${frmPrStMs(processState, pid)}`;
    }
    else if (tmtRchd) {
      statMsg = "\nResponse may be incomplete (timeout reached)";
    }
    // Add timing information if requested
    let tmngMsg = "";
    if (vrbsTmng) {
      const endTime = Date.now();
      const timingInfo = {
        endTime,
        exitReason,
        firstOutputTime: frstOtptTm,
        lastOutputTime: lstOtptTm,
        outputEvents: outputEvents.length > 0 ? outputEvents : undefined,
        startTime,
        timeToFirstOutputMs: frstOtptTm ? frstOtptTm - startTime : undefined,
        totalDurationMs: endTime - startTime,
      };
      tmngMsg = formatTimingInfo(timingInfo);
    }
    if (cleanOutput.trim().length === 0 && !tmtRchd) {
      return {
        content: [
          {
            text: `Input executed in process ${pid}.\n(No output produced)${statMsg}${tmngMsg}`,
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
    if (statMsg) {
      responseText += `\n\n${statMsg}`;
    }
    if (tmngMsg) {
      responseText += tmngMsg;
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
    return {
      content: [{text: `Error interacting with process: ${errorMessage}`, type: "text" }],
      isError: true,
    };
  }
}

// 7. Force terminate ------------------------------------------------------------------------------
export async function forceTerminate(args: unknown): Promise<ServerResult> {
  const parsed = FrcTrArSc.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{text: `Error: Invalid arguments for force_terminate: ${parsed.error}`, type: "text" }],
      isError: true,
    };
  }
  const pid = parsed.data.pid;

  // Handle virtual Node.js sessions (node:local)
  if (clrVrNdSe(pid)) {
    return {
      content: [
        {
          text: `Cleared virtual Node.js session ${pid}`,
          type: "text",
        },
      ],
    };
  }
  const success = trmnMgr.forceTerminate(pid);
  return {
    content: [
      {
        text: success ? `Successfully initiated termination of session ${pid}` : `No active session found for PID ${pid}`,
        type: "text",
      },
    ],
  };
}

// 8. List sessions --------------------------------------------------------------------------------
export async function listSessions(_args: unknown): Promise<ServerResult> {
  const sessions = trmnMgr.listActiveSessions();

  // Include virtual Node.js sessions
  const vrtlSssn = lstVrNdSs();
  const rlSssnTxt = sessions.map((s) => `PID: ${s.pid}, Blocked: ${s.isBlocked}, Runtime: ${Math.round(s.runtime / 1000)}s`);
  const vrtlSssnTxt = vrtlSssn.map((s) => `PID: ${s.pid} (node:local), Timeout: ${s.timeout_ms}ms`);
  const allSessions = [...rlSssnTxt, ...vrtlSssnTxt];

  return {
    content: [
      {
        text: allSessions.length === 0 ? "No active sessions" : allSessions.join("\n"),
        type: "text",
      },
    ],
  };
}
