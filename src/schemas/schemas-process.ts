/**
 * @file src/schemas/schemas-process.ts
 * @description Process argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

const INLINE_TEXT_ARGUMENT_MAX_LENGTH = 50_000;

export const ListProcessesArgsSchema = z.object({});

export const StartProcessArgsSchema = z.object({
  command: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use command_path for long commands").optional(),
  command_path: z.string().optional(),
  command_offset: z.number().optional().default(0),
  command_length: z.number().optional(),
  timeout_ms: z.number(),
  shell: z.string().optional(),
  verbose_timing: z.boolean().optional(),
}).refine((args) => args.command !== undefined || args.command_path !== undefined, {
  message: "Either command or command_path is required",
});

export const StartProcessesArgsSchema = z.object({
  items: z.array(StartProcessArgsSchema).min(1),
});

export const ReadProcessOutputArgsSchema = z.object({
  pid: z.number(),
  timeout_ms: z.number().optional(),
  offset: z.number().optional(),
  length: z.number().optional(),
  verbose_timing: z.boolean().optional(),
});

export const ReadProcessOutputsArgsSchema = z.object({
  items: z.array(ReadProcessOutputArgsSchema).min(1),
});

export const ForceTerminateArgsSchema = z.object({
  pid: z.number(),
});

export const ListSessionsArgsSchema = z.object({});

export const KillProcessArgsSchema = z.object({
  pid: z.number(),
});

export const KillProcessesArgsSchema = z.object({
  pids: z.array(z.number()).min(1),
});

export const InteractWithProcessArgsSchema = z.object({
  pid: z.number(),
  input: z.string().max(INLINE_TEXT_ARGUMENT_MAX_LENGTH, "Use input_path for large input").optional(),
  input_path: z.string().optional(),
  input_offset: z.number().optional().default(0),
  input_length: z.number().optional(),
  timeout_ms: z.number().optional(),
  wait_for_prompt: z.boolean().optional(),
  verbose_timing: z.boolean().optional(),
}).refine((args) => args.input !== undefined || args.input_path !== undefined, {
  message: "Either input or input_path is required",
});

export const InteractWithProcessesArgsSchema = z.object({
  items: z.array(InteractWithProcessArgsSchema).min(1),
});
