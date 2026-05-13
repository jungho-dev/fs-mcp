/**
 * @file src/tools/tools-process.ts
 * @description Process and session tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema } from "@schemas/schemas-args-ref";
import { InteractWithProcessesArgsSchema, KillProcessesArgsSchema, ListSessionsArgsSchema, ReadProcessOutputsArgsSchema, StartProcessesArgsSchema } from "@schemas/schemas-process";
import { BATCH_GUIDANCE, CMD_PREFIX_DESCRIPTION, OS_GUIDANCE, PATH_GUIDANCE, createToolCatalogEntry, type ToolCatalogEntry, type ToolCatalogEntryConfig } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const PROCESS_TOOL_DEFINITIONS = [
  {
    name: "start_processes",
    description: (`
      Start terminal processes in parallel.
      Use command_path for long commands and shell for compatibility overrides.
      ${BATCH_GUIDANCE}
      ${PATH_GUIDANCE}
      ${OS_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(StartProcessesArgsSchema),
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
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(ReadProcessOutputsArgsSchema),
    annotations: {
      title: "Read Process Outputs",
      readOnlyHint: true,
    },
  },
  {
    name: "interact_with_processes",
    description: (`
      Send input to running processes in parallel.
      Use input_path for large stdin payloads.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(InteractWithProcessesArgsSchema),
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
      Shows pid, blocked state, and runtime.
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(ListSessionsArgsSchema),
    annotations: {
      title: "List Terminal Sessions",
      readOnlyHint: true,
    },
  },
  {
    name: "kill_processes",
    description: (`
      Kill one or many processes in parallel.
      ${BATCH_GUIDANCE}
      ${CMD_PREFIX_DESCRIPTION}
    `),
    inputSchema: withArgsPathSchema(KillProcessesArgsSchema),
    annotations: {
      title: "Kill Processes",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies ToolCatalogEntryConfig[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const PROCESS_TOOL_CATALOG: ToolCatalogEntry[] = PROCESS_TOOL_DEFINITIONS.map((entry) => createToolCatalogEntry(entry));
