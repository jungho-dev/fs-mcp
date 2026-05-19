/**
 * @file src/tools/tools-filesystem.ts
 * @description Filesystem and search tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { EdtBlArSc } from "@schemas/schemas-edit";
import { CpyFlArSc, CrtDrArSc, GtFlInArSc2, LstDrArSc, MvFlsArgsSch, RdFlsArgsSch, RmvFlArSc, WrtFlArSc } from "@schemas/schemas-filesystem";
import { GtFlSrReArSc, RgxSrArSc2, StpSrArSc2, StrSrArSc2 } from "@schemas/schemas-search";
import { APPG, BTCH_GDNC, CMD_PRF_DSC, createToolCatalogEntry as crtTlCtEn, PTH_GDNC, type ToolCatalogEntryConfig as TlCtEnCf, type ToolCatalogEntry as TlCtlgEntr } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const FLSY_TL_DFNT = [
  {
    name: "read_files",
    description: `
      Read files in parallel.
      Use paths for simple reads or items for offset, length, headers, or URL reads.
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `,
    inputSchema: wthArPtSc(RdFlsArgsSch),
    annotations: {
      title: "Read Files",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "write_files",
    description: (`
      Write files in parallel.
      Prefer content_path or args_path for large text.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(WrtFlArSc),
    annotations: {
      title: "Write Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "create_directories",
    description: (`
      Create one or many directories in parallel.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(CrtDrArSc),
    annotations: {
      title: "Create Directories",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "list_directories",
    description: (`
      List one or many directories in parallel.
      Use items: [{ path, depth?, maxEntries?, excludePatterns?, includeFiles? }].
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(LstDrArSc),
    annotations: {
      title: "List Directories",
      readOnlyHint: true,
    },
  },
  {
    name: "copy_files",
    description: (`
      Copy one or many files or directories in parallel.
      Use items: [{ source, destination, recursive?, force? }].
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(CpyFlArSc),
    annotations: {
      title: "Copy Files",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "move_files",
    description: (`
      Move or rename one or many files in parallel.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(MvFlsArgsSch),
    annotations: {
      title: "Move/Rename Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "remove_files",
    description: (`
      Delete one or many files or directories in parallel.
      Use items: [{ path, recursive?, force? }].
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(RmvFlArSc),
    annotations: {
      title: "Remove Files",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "start_searches",
    description: (`
      Start searches in parallel.
      pattern_path can reduce transport overhead, and filePattern can narrow the target set.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(StrSrArSc2),
    annotations: {
      title: "Start Searches",
      readOnlyHint: true,
    },
  },
  {
    name: "regex_searches",
    description: (`
      Run ripgrep-compatible regular-expression content searches directly.
      Prefer this over shell rg when regex search is needed.
      pattern_path can reduce transport overhead, and filePattern can narrow the target set.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(RgxSrArSc2),
    annotations: {
      title: "Regex Searches",
      readOnlyHint: true,
    },
  },
  {
    name: "get_full_search",
    description: (`
      Read one or many active search sessions in parallel with full per-item result text.
      Use offset or length for pagination.
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(GtFlSrReArSc),
    annotations: {
      title: "Get Full Search Results",
      readOnlyHint: true,
    },
  },
  {
    name: "stop_searches",
    description: (`
      Stop one or many active searches in parallel.
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(StpSrArSc2),
    annotations: {
      title: "Stop Searches",
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "get_file_infos",
    description: (`
      Retrieve metadata for one or many files in parallel.
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(GtFlInArSc2),
    annotations: {
      title: "Get File Information",
      readOnlyHint: true,
    },
  },
  {
    name: "edit_blocks",
    description: (`
      Apply exact block replacements in parallel.
      Prefer *_path or args_path for large text.
      ${APPG}
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(EdtBlArSc),
    annotations: {
      title: "Edit Blocks",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies TlCtEnCf[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const FLSY_TL_CTLG: TlCtlgEntr[] = FLSY_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const FLSY_TL_CTL2 = FLSY_TL_CTLG;
export {FLSY_TL_CTLG as FILESYSTEM_TOOL_CATALOG};
