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
  idx?: unknown[];
  status: ToolDisplayStatus;
  toolName: string;
}

export interface ToolDisplayTemplateValues {
  idx: number;
  items: number;
  status: ToolDisplayStatus;
  structuredChars: number;
  textChars: number;
  tool: string;
  toolName: string;
}

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Edit this template to freely change visible labels, separators, order, and surrounding text.
const config = {
  reset: `\u001B[0m`,
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
    color: `\u001B[38;5;111m`,
  },
};
const renderLine = () => {
  return `${config.line.color}${config.line.str}${config.reset}\n`
};
const renderRow = (key: string, value: string) => {
  return `${config.key.color}${config.key.str}${key} = ${config.value.color}${config.value.str}${value}${config.reset}\n`;
};
export const TOOL_DISPLAY_TEMPLATE = [
  renderLine(),
  renderRow(`tool`, `\${tool}`),
  renderRow(`status`, `\${status}`),
  renderRow(`idx`, `\${idx}`),
  renderRow(`items`, `\${items}`),
  renderRow(`textChars`, `\${textChars}`),
  renderRow(`structuredChars`, `\${structuredChars}`),
  renderLine(),
].join(``);

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

// 2. Count context indexes ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function countContextIndexes(output: ToolDisplayOutput): number {
  return Array.isArray(output.idx) ? output.idx.length : 0;
}

// 3. Create tool display values ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function createToolDisplayValues(output: ToolDisplayOutput): ToolDisplayTemplateValues {
  const structuredText = stringifyDisplayStructuredContent(output.data.structuredContent);

  return {
    items: output.data.content.length,
    idx: countContextIndexes(output),
    status: output.status,
    structuredChars: structuredText.length,
    textChars: output.data.text.length,
    tool: output.toolName,
    toolName: output.toolName,
  };
}

// 4. Render tool display template ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
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

// 5. Create tool display text ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function createToolDisplayText(output: ToolDisplayOutput, template = TOOL_DISPLAY_TEMPLATE): string {
  return renderToolDisplayTemplate(template, createToolDisplayValues(output));
}
