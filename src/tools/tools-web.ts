/**
 * @file src/tools/tools-web.ts
 * @description Web tool catalog entries.
 * @author JUNGHO
 * @since 2026-07-04
 */

import { withArgsPathSchema as wthArPtSc } from "@schemas/schemas-args-ref";
import { DwFlArSc, WbExArSc, WbFtArSc, WbRnArSc } from "@schemas/schemas-web";
import { BTCH_GDNC, CMD_PRF_DSC, createToolCatalogEntry as crtTlCtEn, PTH_GDNC, type ToolCatalogEntryConfig as TlCtEnCf, type ToolCatalogEntry as TlCtlgEntr } from "@tools/tools-const";

// -------------------------------------------------------------------------------------------------
const WEB_TL_DFNT = [
  {
    name: "web-fetch",
    description: (`
      Fetch one or many URLs over HTTP/HTTPS (no browser) and return the body as markdown, text, links, readability main-content, or raw html.
      TIER-1 fast path: use for static or server-rendered pages and JSON/XHR endpoints; for client-rendered JS/SPA pages use web-render.
      Batch many URLs in one items[] call. Private/loopback/link-local addresses are blocked (SSRF guard).
      ${BTCH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(WbFtArSc),
    annotations: {
      title: "web-fetch",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "web-render",
    description: (`
      Render one URL in the obscura headless browser (JS/SPA, waits, CSS selector, in-page eval, stealth) and dump html, text, or links.
      TIER-2 escalation for pages web-fetch cannot read (client-side rendering, interaction, JS anti-bot). Slower and heavier than web-fetch, so try web-fetch first.
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(WbRnArSc),
    annotations: {
      title: "web-render",
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "web-extract",
    description: (`
      Convert already-held HTML (inline html or a local file path) into markdown, plain text, links, or readability main-content. No network access.
      Use when you already have HTML and only need clean extraction. baseUrl resolves relative links.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(WbExArSc),
    annotations: {
      title: "web-extract",
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "download-to-file",
    description: (`
      Download one or many URLs to files inside allowedDirectories over HTTP/HTTPS.
      Paths are sandboxed to allowedDirectories and the SSRF guard blocks private/loopback hosts. Set overwrite:true to replace an existing file.
      ${BTCH_GDNC}
      ${PTH_GDNC}
      ${CMD_PRF_DSC}
    `),
    inputSchema: wthArPtSc(DwFlArSc),
    annotations: {
      title: "download-to-file",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
] satisfies TlCtEnCf[];

// -------------------------------------------------------------------------------------------------
export const WEB_TL_CTLG: TlCtlgEntr[] = WEB_TL_DFNT.map((entry) => crtTlCtEn(entry));

export const WEB_TL_CTL2 = WEB_TL_CTLG;
export {WEB_TL_CTLG as WEB_TOOL_CATALOG};
