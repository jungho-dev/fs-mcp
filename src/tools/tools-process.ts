/**
 * @file src/tools/tools-process.ts
 * @description Process and session tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { IntWtPrArSc } from "@schemas/schemas-process";
import { BTCH_GDNC, CMD_PRF_DSC, createToolCatalogEntry as crtTlCtEn, type ToolCatalogEntry as TlCtlgEntr, type ToolCatalogEntryConfig as TlCtEnCf } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const PROC_TL_DFNT = [
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
] satisfies TlCtEnCf[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const PROC_TL_CTLG: TlCtlgEntr[] = PROC_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const PROC_TL_CTL2 = PROC_TL_CTLG;
export {PROC_TL_CTLG as PROCESS_TOOL_CATALOG};
