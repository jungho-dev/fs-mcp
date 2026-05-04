/**
 * @file src/controllers/controllers-edit.ts
 * @description MCP edit tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import { createBatchToolResponse, runParallelBatch } from "@controllers/controllers-batch";
import { handleEditBlock } from "@features/edit/edit-service";
import { EditBlocksArgsSchema } from "@schemas/schemas-edit";

// Handle edit_block command
// Uses the enhanced implementation with multiple occurrence support and fuzzy matching
export { handleEditBlock };

// 1. Handle edit blocks ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleEditBlocks(args: unknown) {
  const parsed = EditBlocksArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleEditBlock(item));
  const response = createBatchToolResponse("edit_blocks", results);

  return response;
}
