/**
 * @file src/controllers/controllers-edit.ts
 * @description MCP edit tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import { createBatchToolResponse as crtBtchTlRes, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { handleEditBlock as hndlEdtBlck } from "@features/edit/edit-service";
import { EdtBlArSc } from "@schemas/schemas-edit";

// Handle edit_block command
// Uses the enhanced implementation with multiple occurrence support and fuzzy matching
export { hndlEdtBlck as handleEditBlock };

// 1. Handle edit blocks ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleEditBlocks(args: unknown) {
  const parsed = EdtBlArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => hndlEdtBlck(item));
  const response = crtBtchTlRes("edit_blocks", results);

  return response;
}
