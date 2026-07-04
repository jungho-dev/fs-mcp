/**
 * @file src/cores/responses/responses-tool-display.ts
 * @description MCP tool display text format.
 * @author JUNGHO
 * @since 2026-05-10
 */

import type { ServerResult, ServerResponseContent as SrvrResCont } from "@assets/type/common";
import {curClnt} from "@features/config/config-client";

// ---------------------------------------------------------------------------------------------
type ToolDisplayStatus = "success" | "error";
type ToolDisplayValue = number | string;

export declare interface ToolDisplayOutput {
  data: {
    content: SrvrResCont[];
    structuredContent: ServerResult["structuredContent"] | null;
    text?: string;
  };
  durationMs?: number | null;
  status: ToolDisplayStatus;
  toolName: string;
}

export declare interface ToolDisplayTemplateValues {
  tool: string;
  toolName: string;
  items: number;
  count: number;
  status: ToolDisplayStatus;
  duration: string;
  durationMs: string;
  tokens: string;
  contents: string;
  structuredText: string;
}

// ---------------------------------------------------------------------------------------------
// Edit this template to freely change visible labels, separators, order, and surrounding text.
const config = {
  reset: {
    str: ``,
    color: `\u001B[0m`,
  },
  line: {
    str: `-----------------------------------`,
    color: `\u001B[38;5;214m`,
  },
  key: {
    str: `• `,
    color: `\u001B[38;5;231m`,
  },
  value: {
    str: ``,
    color: `\u001B[38;2;0;180;216m`,
  },
};

const renderLine = () => `${config.line.color}${config.line.str}${config.reset.color}\n`;
const renderRow = (key: string, value: string) => `${config.key.color}${config.key.str}${key} = ${config.value.color}${config.value.str}${value}${config.reset.color}\n`;

export const TL_DSPL_TMPL = [
  renderLine(),
  renderRow(`tool`, `\${tool}`),
  renderRow(`items`, `\${items}`),
  renderRow(`status`, `\${status}`),
  renderRow(`duration`, `\${duration}`),
  renderRow(`tokens`, `\${tokens}`),
  renderRow(`contents`, `\${contents}`),
  renderRow(`structuredText`, `\${structuredText}`),
  renderLine(),
].join(``);

const intgFrmt = new Intl.NumberFormat(`en-US`);
const scndFrmt = new Intl.NumberFormat(`en-US`, {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});
const ANSI_ESC_PAT = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const TKN_CHR_RT = 4;

// 1. Measure display structured content -----------------------------------------------------
function measureDisplayStructuredContent(value: ServerResult["structuredContent"] | null): number {
  if (value === null || value === undefined) {
    return 0;
  }
  try {
    return (JSON.stringify(value) ?? String(value)).length;
  }
  catch {
    return String(value).length;
  }
}

// 2. Count display items --------------------------------------------------------------------------
function itemsDisplayItems(output: ToolDisplayOutput): number {
  const strcCont = output.data.structuredContent;

  if (typeof strcCont === "object" && strcCont !== null) {
    const totalCount = (strcCont as Record<string, unknown>).totalCount;
    const results = (strcCont as Record<string, unknown>).results;

    if (typeof totalCount === "number" && Number.isFinite(totalCount)) {
      return totalCount;
    }
    if (Array.isArray(results)) {
      return results.length;
    }
  }
  return output.data.content.length;
}

// 3. Format display number with unit -------------------------------------------------------------
function formatDisplayNumber(value: number, unit: string): string {
  return `${intgFrmt.format(value)} ${unit}`;
}

// 4. Format display duration -------------------------------------------------------------------
function formatDisplayDuration(duration: number | null | undefined, unit: string): string {
  if (duration === null || duration === undefined) {
    return `null`;
  }
  return `${scndFrmt.format(duration / 1000)} ${unit}`;
}

// 5. Estimate display tokens --------------------------------------------------------------------
function estimateDisplayTokens(textChars: number, structuredChars: number): number {
  const totalChars = textChars + structuredChars;

  if (totalChars === 0) {
    return 0;
  }
  return Math.ceil(totalChars / TKN_CHR_RT);
}

// 5-1. Measure display content text ---------------------------------------------------------------
// Compact envelopes omit data.text, so fall back to summing the content text blocks.
function measureDisplayContentText(output: ToolDisplayOutput): number {
  if (typeof output.data.text === "string") {
    return output.data.text.length;
  }
  return output.data.content.reduce((total, item) => total + (typeof item.text === "string" ? item.text.length : 0), 0);
}

// 6. Create tool display values -----------------------------------------------------------------
function createToolDisplayValues(output: ToolDisplayOutput): ToolDisplayTemplateValues {
  const strcTxtChrs = measureDisplayStructuredContent(output.data.structuredContent);
  const itemCount = itemsDisplayItems(output);
  const cntnTxtChrs = measureDisplayContentText(output);
  const tokenCount = estimateDisplayTokens(cntnTxtChrs, strcTxtChrs);

  return {
    tool: output.toolName,
    toolName: output.toolName,
    items: itemCount,
    count: itemCount,
    status: output.status,
    duration: formatDisplayDuration(output.durationMs, `sec`),
    durationMs: formatDisplayDuration(output.durationMs, `sec`),
    tokens: formatDisplayNumber(tokenCount, `token est`),
    contents: formatDisplayNumber(cntnTxtChrs, `chars`),
    structuredText: formatDisplayNumber(strcTxtChrs, `chars`),
  };
}

// 7. Render tool display template ---------------------------------------------------------------
function renderToolDisplayTemplate(template: string, values: ToolDisplayTemplateValues): string {
  const plchPat = /\$\{([A-Za-z][A-Za-z0-9]*)\}/g;

  return template.replace(plchPat, (placeholder: string, field: string) => {
    const value = values[field as keyof ToolDisplayTemplateValues] as ToolDisplayValue | undefined;

    if (value === undefined) {
      return placeholder;
    }
    return String(value);
  });
}

// 8. Strip ANSI escape sequences ----------------------------------------------------------------
function stripAnsiEscapes(value: string): string {
  return value.replace(ANSI_ESC_PAT, ``);
}

// 9. Check Gemini client display ------------------------------------------------------------------
function isGeminiClientDisplay(): boolean {
  return curClnt.name.toLowerCase().includes(`gemini`);
}

// 10. Create tool display text -------------------------------------------------------------------
export function createToolDisplayText(output: ToolDisplayOutput, template = TL_DSPL_TMPL): string {
  const displayText = renderToolDisplayTemplate(template, createToolDisplayValues(output));

  if (isGeminiClientDisplay()) {
    return stripAnsiEscapes(displayText);
  }
  return displayText;
}
