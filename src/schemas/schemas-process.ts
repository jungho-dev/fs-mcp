/**
 * @file src/schemas/schemas-process.ts
 * @description Process argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const StrPrArSc = z.object({
  command: z.string().optional(),
  command_path: z.string().optional(),
  command_offset: z.number().optional().default(0),
  command_length: z.number().optional(),
  timeout_ms: z.number(),
  shell: z.string().optional(),
  verbose_timing: z.boolean().optional(),
}).refine((args) => args.command !== undefined || args.command_path !== undefined, {
  message: "Either command or command_path is required",
});

export const StrPrArSc2 = z.object({
  items: z.array(StrPrArSc).min(1),
});

export const RdPrOtArSc = z.object({
  pid: z.number(),
  timeout_ms: z.number().optional(),
  offset: z.number().optional(),
  length: z.number().optional(),
  verbose_timing: z.boolean().optional(),
});

export const RdPrOtArSc2 = z.object({
  items: z.array(RdPrOtArSc).min(1),
});

export const FrcTrArSc = z.object({
  pid: z.number(),
});

export const LstSsArSc = z.object({});

export const KllPrArSc = z.object({
  pid: z.number(),
});

export const KllPrArSc2 = z.object({
  pids: z.array(z.number()).min(1),
});

export const IntWtPrArSc2 = z.object({
  pid: z.number(),
  input: z.string().optional(),
  input_path: z.string().optional(),
  input_offset: z.number().optional().default(0),
  input_length: z.number().optional(),
  timeout_ms: z.number().optional(),
  wait_for_prompt: z.boolean().optional(),
  verbose_timing: z.boolean().optional(),
}).refine((args) => args.input !== undefined || args.input_path !== undefined, {
  message: "Either input or input_path is required",
});

export const IntWtPrArSc = z.object({
  items: z.array(IntWtPrArSc2).min(1),
});
