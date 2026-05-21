/**
 * @file src/tools/tools-config.ts
 * @description Configuration tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { GtCnArSc, StCfVaArSc } from "@schemas/schemas-config";
import { BTCH_GDNC, CMD_PRF_DSC, createToolCatalogEntry as crtTlCtEn, type ToolCatalogEntry as TlCtlgEntr, type ToolCatalogEntryConfig as TlCtEnCf } from "@tools/tools-const";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
const CFG_TL_DFNT = [
  {
    name: "get_configs",
    description: (`
      Get configuration values by key.
      Omit items to return the full supported config surface.
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(GtCnArSc),
    annotations: {
      title: "Get Configurations",
      readOnlyHint: true,
    },
  },
  {
    name: "set_config_values",
    description: (`
      Set one or many configuration values in parallel.
      value_path can reduce transport overhead for values.
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(StCfVaArSc),
    annotations: {
      title: "Set Configuration Values",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
] satisfies TlCtEnCf[];

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const CFG_TL_CTLG: TlCtlgEntr[] = CFG_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const CFG_TL_CTLG2 = CFG_TL_CTLG;
export {CFG_TL_CTLG as CONFIG_TOOL_CATALOG};
