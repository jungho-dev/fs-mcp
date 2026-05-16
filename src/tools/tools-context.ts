/**
 * @file src/tools/tools-context.ts
 * @description Context index tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-16
 */

import {withArgsPathSchema as wthArPtSc2} from "@schemas/schemas-args-ref";
import {ClrCtIdArSc, LstCtIdArSc, SrcCtIdArSc} from "@schemas/schemas-context";
import {CMD_PRF_DSC as CMD_PRF_DSC2, createToolCatalogEntry as crtTlCtEn2, type ToolCatalogEntry as TlCtlgEntr2, type ToolCatalogEntryConfig as TlCtEnCf2} from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const CTX_TL_DFNT = [
  {
    name: "list_context_index",
    description: [
      "List SQLite context index documents.",
      "Use source to filter by context source and limit to cap returned documents.",
      CMD_PRF_DSC2,
    ].join("\n"),
    inputSchema: wthArPtSc2(LstCtIdArSc),
    annotations: {
      title: "List Context Index",
      readOnlyHint: true,
    },
  },
  {
    name: "search_context_index",
    description: [
      "Search SQLite context index chunks with FTS query tokenization.",
      "Use source to filter by context source and limit to cap returned chunks.",
      CMD_PRF_DSC2,
    ].join("\n"),
    inputSchema: wthArPtSc2(SrcCtIdArSc),
    annotations: {
      title: "Search Context Index",
      readOnlyHint: true,
    },
  },
  {
    name: "clear_context_index",
    description: [
      "Delete SQLite context index documents by id, source, date cutoff, or all=true.",
      "Set vacuum=true when disk compaction is required after deletion.",
      CMD_PRF_DSC2,
    ].join("\n"),
    inputSchema: wthArPtSc2(ClrCtIdArSc),
    annotations: {
      title: "Clear Context Index",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies TlCtEnCf2[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CTX_TL_CTLG: TlCtlgEntr2[] = CTX_TL_DFNT.map((entry) => crtTlCtEn2(entry));

export const CTX_TL_CTLG2 = CTX_TL_CTLG;
export {CTX_TL_CTLG as CONTEXT_TOOL_CATALOG};
