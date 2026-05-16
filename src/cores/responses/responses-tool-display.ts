/**
 * @file src/cores/responses/responses-tool-display.ts
 * @description MCP tool display text format.
 * @author JUNGHO
 * @since 2026-05-10
 */

import type { ServerResponseContent as SrvrResCont, ServerResult } from "@assets/type/common";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
type ToolDisplayStatus = "success" | "error";
type ToolDisplayValue = number | string;

export interface ToolDisplayOutput {
  data: {
    content: SrvrResCont[];
    structuredContent: ServerResult["structuredContent"] | null;
    text: string;
  };
  durationMs?: number | null;
  status: ToolDisplayStatus;
  toolName: string;
}

export interface ToolDisplayTemplateValues {
  count: number;
  items: number;
  contents: string;
  durationMs: string;
  status: ToolDisplayStatus;
  structuredText: string;
  tool: string;
  toolName: string;
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
  renderRow(`duration`, `\${durationMs}`),
  renderRow(`contents`, `\${contents}`),
  renderRow(`structuredText`, `\${structuredText}`),
  renderLine(),
].join(``);

const intgFrmt = new Intl.NumberFormat(`en-US`);
const scndFrmt = new Intl.NumberFormat(`en-US`, {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});

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
function formatDisplayDuration(durationMs?: number | null): string {
  if (durationMs === null || durationMs === undefined) {
    return `null`;
  }
  return `${scndFrmt.format(durationMs / 1000)} s`;
}

// 5. Create tool display values ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createToolDisplayValues(output: ToolDisplayOutput): ToolDisplayTemplateValues {
  const strcTxt = stringifyDisplayStructuredContent(output.data.structuredContent);

  return {
    count: itemsDisplayItems(output),
    items: itemsDisplayItems(output),
    contents: formatDisplayNumber(output.data.text.length, `chars`),
    durationMs: formatDisplayDuration(output.durationMs),
    status: output.status,
    structuredText: formatDisplayNumber(strcTxt.length, `chars`),
    tool: output.toolName,
    toolName: output.toolName,
  };
}

// 6. Render tool display template ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 7. Create tool display text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolDisplayText(output: ToolDisplayOutput, template = TL_DSPL_TMPL): string {
  return renderToolDisplayTemplate(template, createToolDisplayValues(output));
}
