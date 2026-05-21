/**
 * @file src/tools/tools-process.ts
 * @description Process and session tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { IntWtPrArSc, KllPrArSc2, LstSsArSc, RdPrOtArSc2, StrPrArSc2 } from "@schemas/schemas-process";
import { BTCH_GDNC, CMD_PRF_DSC, OS_GUIDANCE, PTH_GDNC, createToolCatalogEntry as crtTlCtEn, type ToolCatalogEntry as TlCtlgEntr, type ToolCatalogEntryConfig as TlCtEnCf } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const PROC_TL_DFNT = [
  {
    name: "start_processes",
    description: (`
      Start terminal processes in parallel.
      Use command_path for long commands and shell for compatibility overrides.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${OS_GUIDANCE}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(StrPrArSc2),
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
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(RdPrOtArSc2),
    annotations: {
      title: "Read Process Outputs",
      readOnlyHint: true,
    },
  },
  {
    name: "interact_with_processes",
    description: (`
      Send input to running processes in parallel.
      input_path can reduce transport overhead for stdin payloads.
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(IntWtPrArSc),
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
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(LstSsArSc),
    annotations: {
      title: "List Terminal Sessions",
      readOnlyHint: true,
    },
  },
  {
    name: "kill_processes",
    description: (`
      Kill one or many processes in parallel.
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(KllPrArSc2),
    annotations: {
      title: "Kill Processes",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies TlCtEnCf[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const PROC_TL_CTLG: TlCtlgEntr[] = PROC_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const PROC_TL_CTL2 = PROC_TL_CTLG;
export {PROC_TL_CTLG as PROCESS_TOOL_CATALOG};
