/**
 * @file src/cores/responses/responses-tool-display.ts
 * @description MCP tool display text format.
 * @author JUNGHO
 * @since 2026-05-10
 */

import type { ServerResult, ServerResponseContent as SrvrResCont } from "@assets/type/common";
import {curClnt} from "@features/config/config-client";
import {countTokens as cntTkns} from "gpt-tokenizer";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
type ToolDisplayStatus = "success" | "error";
type ToolDisplayValue = number | string;

export declare interface ToolDisplayOutput {
  data: {
    content: SrvrResCont[];
    structuredContent: ServerResult["structuredContent"] | null;
    text: string;
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

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Edit this template to freely change visible labels, separators, order, and surrounding text.
const config = {
  reset: {
    str: ``,
    color: `\u001B[0m`,
  },
  line: {
    str: `―――――――――――――――――――――――――――――――――――`,
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
  renderRow(`tokens`, `\${tokens}`),
  renderRow(`duration`, `\${duration}`),
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

// 1. Stringify display structured content ―――――――――――――――――――――――――――――――――――――――――――――――――――――
function stringifyDisplayStructuredContent(value: ServerResult["structuredContent"] | null): string {
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  }
  catch {
    return String(value);
  }
}

// 2. Count display items ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 3. Format display number with unit ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatDisplayNumber(value: number, unit: string): string {
  return `${intgFrmt.format(value)} ${unit}`;
}

// 4. Format display duration ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatDisplayDuration(duration: number | null | undefined, unit: string): string {
  if (duration === null || duration === undefined) {
    return `null`;
  }
  return `${scndFrmt.format(duration / 1000)} ${unit}`;
}

// 5. Count display tokens ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countDisplayTokens(value: string): number {
  return cntTkns(value);
}

// 6. Create tool display values ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createToolDisplayValues(output: ToolDisplayOutput): ToolDisplayTemplateValues {
  const strcTxt = stringifyDisplayStructuredContent(output.data.structuredContent);
  const tokenCount = countDisplayTokens(`${output.data.text}\n${strcTxt}`);

  return {
    tool: output.toolName,
    toolName: output.toolName,
    items: itemsDisplayItems(output),
    count: itemsDisplayItems(output),
    status: output.status,
    duration: formatDisplayDuration(output.durationMs, `sec`),
    durationMs: formatDisplayDuration(output.durationMs, `sec`),
    tokens: formatDisplayNumber(tokenCount, `token`),
    contents: formatDisplayNumber(output.data.text.length, `chars`),
    structuredText: formatDisplayNumber(strcTxt.length, `chars`),
  };
}

// 7. Render tool display template ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 8. Strip ANSI escape sequences ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function stripAnsiEscapes(value: string): string {
  return value.replace(ANSI_ESC_PAT, ``);
}

// 9. Check Gemini client display ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function isGeminiClientDisplay(): boolean {
  return curClnt.name.toLowerCase().includes(`gemini`);
}

// 10. Create tool display text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolDisplayText(output: ToolDisplayOutput, template = TL_DSPL_TMPL): string {
  const displayText = renderToolDisplayTemplate(template, createToolDisplayValues(output));

  if (isGeminiClientDisplay()) {
    return stripAnsiEscapes(displayText);
  }
  return displayText;
}
