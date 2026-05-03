/**
 * @file src/mcp/controllers/edit-controller.ts
 * @description MCP edit tool handlers.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { createBatchToolResponse, runParallelBatch } from "@mcp/controllers/batch-tool-support";
import { EditBlocksArgsSchema } from "@mcp/schemas/schema-exports";
import {handleEditBlock} from "@features/edit/edit-service";

/**
 * Handle edit_block command
 * Uses the enhanced implementation with multiple occurrence support and fuzzy matching
 */
export {handleEditBlock};

/**
 * Handle edit_blocks command.
 */
export async function handleEditBlocks(args: unknown) {
  const parsed = EditBlocksArgsSchema.parse(args);
  const results = await runParallelBatch(parsed.items, (item) => handleEditBlock(item));
  const response = createBatchToolResponse("edit_blocks", results);

  return response;
}
