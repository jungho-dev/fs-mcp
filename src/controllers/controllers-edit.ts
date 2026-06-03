/**
 * @file src/controllers/controllers-edit.ts
 * @description MCP edit tool
 * @author JUNGHO
 * @since 2026-05-02
 */

import { createBatchToolResponse as crtBtchTlRes, runLimitedParallelBatch as rnLmPrBt, runParallelBatch as rnPrllBtch } from "@controllers/controllers-batch";
import { handleEditBlock as hndlEdtBlck, handleEditLineRange as hndlEdtLnRng } from "@features/edit/edit-service";
import { EdtBlArSc, EdtLnArSc } from "@schemas/schemas-edit";

// Handle edit_block command
// Uses the enhanced implementation with multiple occurrence support and fuzzy matching
export { hndlEdtBlck as handleEditBlock };

// 1. Handle edit blocks ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleEditBlocks(args: unknown) {
  const parsed = EdtBlArSc.parse(args);
  const results = await rnPrllBtch(parsed.items, (item) => hndlEdtBlck(item));
  const response = crtBtchTlRes("file-edit", results);

  return response;
}

// 2. Handle edit lines ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
// Runs sequentially so multiple items editing the same file cannot interleave reads and writes.
export async function handleEditLines(args: unknown) {
  const parsed = EdtLnArSc.parse(args);
  const results = await rnLmPrBt(parsed.items, 1, (item) => hndlEdtLnRng(item));
  const response = crtBtchTlRes("file-edit-lines", results);

  return response;
}
