/**
 * @file src/tools/tools-process.ts
 * @description Process and session tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema } from "@schemas/schemas-args-ref";
import { InteractWithProcessesArgsSchema, KillProcessesArgsSchema, ListProcessesArgsSchema, ListSessionsArgsSchema, ReadProcessOutputsArgsSchema, StartProcessesArgsSchema } from "@schemas/schemas-process";
import { CMD_PREFIX_DESCRIPTION, OS_GUIDANCE, PATH_GUIDANCE, type ToolCatalogEntry } from "@tools/tools-const";
import { zodToJsonSchema } from "zod-to-json-schema";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const PROCESS_TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "start_processes",
    description: (`
      Start one or many terminal processes in parallel.
      Use items: [{ command?, command_path?, timeout_ms, shell?, verbose_timing? }].
      Inline command is capped; use command_path for long commands so tool-call logs do not echo the full command.
      ALWAYS USE FOR: Local file analysis, CSV processing, data exploration, system commands
      ${PATH_GUIDANCE}
      ${OS_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(StartProcessesArgsSchema)),
    annotations: {
      title: "Start Terminal Processes",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "read_process_outputs",
    description: (`
      Read one or many process outputs in parallel.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ReadProcessOutputsArgsSchema)),
    annotations: {
      title: "Read Process Outputs",
      readOnlyHint: true,
    },
  },
  {
    name: "interact_with_processes",
    description: (`
      Interact with one or many running processes in parallel.
      Inline input is capped; use input_path for large stdin payloads so tool-call logs do not echo the full input.
      ALWAYS USE FOR: CSV analysis, JSON processing, file statistics, data visualization prep, ANY local file work
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(InteractWithProcessesArgsSchema)),
    annotations: {
      title: "Send Input to Processes",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "list_sessions",
    description: (`
      List all active terminal sessions.
      Shows session status including:
      - PID: Process identifier
      - Blocked: Whether session is waiting for input
      - Runtime: How long the session has been running
      DEBUGGING REPLs:
      - "Blocked: true" often means REPL is waiting for input
      - Use this to verify sessions are running before sending input
      - Long runtime with blocked status may indicate stuck process
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ListSessionsArgsSchema)),
    annotations: {
      title: "List Terminal Sessions",
      readOnlyHint: true,
    },
  },
  {
    name: "list_processes",
    description: (`
      List all running processes.
      Returns process information including PID, command name, CPU usage, and memory usage.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(ListProcessesArgsSchema)),
    annotations: {
      title: "List Running Processes",
      readOnlyHint: true,
    },
  },
  {
    name: "kill_processes",
    description: (`
      Kill one or many processes in parallel.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: zodToJsonSchema(withArgsPathSchema(KillProcessesArgsSchema)),
    annotations: {
      title: "Kill Processes",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
