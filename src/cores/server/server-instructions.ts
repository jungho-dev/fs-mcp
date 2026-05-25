/**
 * @file src/cores/server/server-instructions.ts
 * @description MCP server usage instructions.
 * @author JUNGHO
 * @since 2026-05-07
 */

export const SRVR_INST = [
  "Use fs-mcp for local filesystem, search, and git work.",
  "Batch-first rule: when one task needs multiple file, directory, search, or git operations of the same kind, put every item into one fs-mcp tool call instead of calling the same tool repeatedly.",
].join("\n");

export const SRVR_INST2 = SRVR_INST;
export { SRVR_INST as SERVER_INSTRUCTIONS };
