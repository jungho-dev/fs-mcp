/**
 * @file src/cores/server/server-instructions.ts
 * @description MCP server usage instructions.
 * @author JUNGHO
 * @since 2026-05-07
 */

export const SERVER_INSTRUCTIONS = [
  "Use fs-mcp for local filesystem, process, git, config, and context-index work.",
  "Batch-first rule: when one task needs multiple file, directory, search, process, config, or context operations of the same kind, put every item into one fs-mcp tool call instead of calling the same tool repeatedly.",
].join("\n");
