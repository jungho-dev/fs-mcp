/**
 * @file src/tools/tools-filesystem.ts
 * @description Filesystem and search tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { EdtBlArSc, EdtLnArSc } from "@schemas/schemas-edit";
import { CpyFlArSc, CrtDrArSc, GtFlInArSc2, LstDrArSc, MvFlsArgsSch, RdFlsArgsSch, RmvFlArSc, WrtFlArSc } from "@schemas/schemas-filesystem";
import { InspArSc } from "@schemas/schemas-inspect";
import { GtFlSrReArSc, RgxSrArSc2, StpSrArSc2, StrSrArSc2 } from "@schemas/schemas-search";
import { APPG, BTCH_GDNC, CMD_PRF_DSC, createToolCatalogEntry as crtTlCtEn, PTH_GDNC, type ToolCatalogEntryConfig as TlCtEnCf, type ToolCatalogEntry as TlCtlgEntr } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const FLSY_TL_DFNT = [
  {
    name: "file-read",
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
    name: "file-lines",
    description: `
      Read text files in parallel with 1-based line numbers.
      Use paths for simple reads or items for offset and length.
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `,
    inputSchema: wthArPtSc(RdFlsArgsSch),
    annotations: {
      title: "Read Files With Line Numbers",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "file-write",
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
    name: "dir-mk",
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
    name: "dir-list",
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
    name: "file-copy",
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
    name: "file-move",
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
    name: "file-remove",
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
    name: "search-start",
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
    name: "search-regex",
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
    name: "search-get",
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
    name: "search-stop",
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
    name: "file-infos",
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
    name: "file-edit",
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
  {
    name: "file-edit-lines",
    description: (`
      Replace, insert, or delete by 1-based line numbers. PREFER over file-edit when line numbers are known (faster, no EOL crafting). EOL auto-detected from file. Use \`after: true\` to insert after end_line without removing it.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(EdtLnArSc),
    annotations: {
      title: "file-edit-lines",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "fs-inspect",
    description: (`
      Run compact read-only filesystem inspection requests in one call for coding tasks. Supports count-files, search, json-pick, snippet, and git-status operations. Bundle file reads, content search, and a git-status/branch lookup into a SINGLE call to avoid multiple tool round-trips. For count-files, use glob or pattern for filename matching; git-status takes an optional path (defaults to root).
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(InspArSc),
    annotations: {
      title: "fs-inspect",
      readOnlyHint: true,
    },
  },
] satisfies TlCtEnCf[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const FLSY_TL_CTLG: TlCtlgEntr[] = FLSY_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const FLSY_TL_CTL2 = FLSY_TL_CTLG;
export {FLSY_TL_CTLG as FILESYSTEM_TOOL_CATALOG};
