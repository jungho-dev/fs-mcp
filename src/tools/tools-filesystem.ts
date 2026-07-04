/**
 * @file src/tools/tools-filesystem.ts
 * @description Filesystem and search tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { EdtBlArSc, EdtLnArSc } from "@schemas/schemas-edit";
import { CpyFlArSc, CrtDrArSc, GtFlInArSc2, LstDrArSc, MvFlsArgsSch, RdFlsArgsSch, RdLnRngArSc, RmvFlArSc, WrtFlArSc } from "@schemas/schemas-filesystem";
import { InspArSc } from "@schemas/schemas-inspect";
import { RgxSrArSc2 } from "@schemas/schemas-search";
import { APPG, BTCH_GDNC, CMD_PRF_DSC, createToolCatalogEntry as crtTlCtEn, PTH_GDNC, type ToolCatalogEntryConfig as TlCtEnCf, type ToolCatalogEntry as TlCtlgEntr } from "@tools/tools-const";

// -------------------------------------------------------------------------------------------------
const FLSY_TL_DFNT = [
  {
    name: "file-read",
    description: `
      Read files in parallel.
      When a task needs 2+ files, put them all in one paths[] (or items) call instead of calling file-read once per file.
      Use paths for simple reads or items for offset, length, headers, or URL reads.
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `,
    inputSchema: wthArPtSc(RdFlsArgsSch),
    annotations: {
      title: "file-read",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "file-read-line-range",
    description: `
      Read ranges from local text files and return each line with its 1-based line number.
      When a task needs ranges from 2+ files, put them all in one items call instead of one call per file.
      Use paths to read complete files or items with start_line and line_count for bounded ranges.
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `,
    inputSchema: wthArPtSc(RdLnRngArSc),
    annotations: {
      title: "file-read-line-range",
      readOnlyHint: true,
      openWorldHint: false,
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
      title: "file-write",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "dir-create",
    description: (`
      Create one or many directories in parallel.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(CrtDrArSc),
    annotations: {
      title: "dir-create",
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
      title: "dir-list",
      readOnlyHint: true,
    },
  },
  {
    name: "path-copy",
    description: (`
      Copy one or many files or directories in parallel.
      Use items: [{ source, destination, recursive?, force? }].
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(CpyFlArSc),
    annotations: {
      title: "path-copy",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "path-move",
    description: (`
      Move or rename one or many files in parallel.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(MvFlsArgsSch),
    annotations: {
      title: "path-move",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "path-remove",
    description: (`
      Delete one or many files or directories in parallel.
      Use items: [{ path, recursive?, force? }].
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(RmvFlArSc),
    annotations: {
      title: "path-remove",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "fs-search",
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
      title: "fs-search",
      readOnlyHint: true,
    },
  },
  {
    name: "path-stat",
    description: (`
      Retrieve metadata for one or many filesystem paths in parallel.
      Set allowMissing true to return missing local paths as non-error missing results.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(GtFlInArSc2),
    annotations: {
      title: "path-stat",
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
      title: "file-edit",
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

// -------------------------------------------------------------------------------------------------
export const FLSY_TL_CTLG: TlCtlgEntr[] = FLSY_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const FLSY_TL_CTL2 = FLSY_TL_CTLG;
export {FLSY_TL_CTLG as FILESYSTEM_TOOL_CATALOG};
