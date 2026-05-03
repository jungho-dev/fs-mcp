/**
 * @file src/mcp/schemas/process-schema.ts
 * @description Process argument schemas.
 * @author JUNGHO
 * @since 2026-05-02
 */

import {z} from "zod";

export const ListProcessesArgsSchema = z.object({});

export const StartProcessArgsSchema = z.object({
  command: z.string(),
  timeout_ms: z.number(),
  shell: z.string().optional(),
  verbose_timing: z.boolean().optional(),
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

export const ForceTerminateProcessesArgsSchema = z.object({
  pids: z.array(z.number()).min(1),
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
  input: z.string(),
  timeout_ms: z.number().optional(),
  wait_for_prompt: z.boolean().optional(),
  verbose_timing: z.boolean().optional(),
});

export const InteractWithProcessesArgsSchema = z.object({
  items: z.array(InteractWithProcessArgsSchema).min(1),
});
