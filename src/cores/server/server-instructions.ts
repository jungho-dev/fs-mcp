/**
 * @file src/cores/server/server-instructions.ts
 * @description MCP server usage instructions.
 * @author JUNGHO
 * @since 2026-05-07
 */

export const SERVER_INSTRUCTIONS = [
  "Use fs-mcp for local filesystem, process, git, config, and context-index work.",
  "Caveman mode: when the user asks for caveman mode, answer terse, exact, and filler-free.",
  "Caveman mode must use one line in this exact pattern: [thing] [action] [reason] [next step]. Keep technical facts intact.",
].join("\n");
