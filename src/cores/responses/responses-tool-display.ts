/**
 * @file src/cores/responses/responses-tool-display.ts
 * @description MCP tool display text format.
 * @author JUNGHO
 * @since 2026-05-10
 */

import type { ServerResponseContent, ServerResult } from "@assets/type/common";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
type ToolDisplayStatus = "success" | "error";
type ToolDisplayValue = number | string;

export interface ToolDisplayOutput {
  data: {
    content: ServerResponseContent[];
    structuredContent: ServerResult["structuredContent"] | null;
    text: string;
  };
  durationMs?: number | null;
  status: ToolDisplayStatus;
  toolName: string;
}

export interface ToolDisplayTemplateValues {
  count: number;
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

export const TOOL_DISPLAY_TEMPLATE = [
  renderLine(),
  renderRow(`tool`, `\${tool}`),
  renderRow(`count`, `\${count}`),
  renderRow(`status`, `\${status}`),
  renderRow(`duration`, `\${durationMs}`),
  renderRow(`contents`, `\${contents}`),
  renderRow(`structuredText`, `\${structuredText}`),
  renderLine(),
].join(``);

const integerFormatter = new Intl.NumberFormat(`en-US`);
const secondsFormatter = new Intl.NumberFormat(`en-US`, {
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
function countDisplayItems(output: ToolDisplayOutput): number {
  const structuredContent = output.data.structuredContent;

  if (typeof structuredContent === "object" && structuredContent !== null) {
    const totalCount = (structuredContent as Record<string, unknown>).totalCount;
    const results = (structuredContent as Record<string, unknown>).results;

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
  return `${integerFormatter.format(value)} ${unit}`;
}

// 4. Format display duration ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function formatDisplayDuration(durationMs?: number | null): string {
  if (durationMs === null || durationMs === undefined) {
    return `null`;
  }
  return `${secondsFormatter.format(durationMs / 1000)} s`;
}

// 5. Create tool display values ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createToolDisplayValues(output: ToolDisplayOutput): ToolDisplayTemplateValues {
  const structuredText = stringifyDisplayStructuredContent(output.data.structuredContent);

  return {
    count: countDisplayItems(output),
    contents: formatDisplayNumber(output.data.text.length, `chars`),
    durationMs: formatDisplayDuration(output.durationMs),
    status: output.status,
    structuredText: formatDisplayNumber(structuredText.length, `chars`),
    tool: output.toolName,
    toolName: output.toolName,
  };
}

// 6. Render tool display template ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function renderToolDisplayTemplate(template: string, values: ToolDisplayTemplateValues): string {
  const placeholderPattern = /\$\{([A-Za-z][A-Za-z0-9]*)\}/g;

  return template.replace(placeholderPattern, (placeholder: string, field: string) => {
    const value = values[field as keyof ToolDisplayTemplateValues] as ToolDisplayValue | undefined;

    if (value === undefined) {
      return placeholder;
    }
    return String(value);
  });
}

// 7. Create tool display text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolDisplayText(output: ToolDisplayOutput, template = TOOL_DISPLAY_TEMPLATE): string {
  return renderToolDisplayTemplate(template, createToolDisplayValues(output));
}
