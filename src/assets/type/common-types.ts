/**
 * @file src/assets/type/common-types.ts
 * @description Shared application types.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ChildProcess} from "node:child_process";
import type {FilteredStdioServerTransport} from "@app/transport/stdio-transport";
import type {PreviewFileType} from "@features/filesystem/readers/preview-file-types";

declare global {
  var mcpTransport: FilteredStdioServerTransport | undefined;
}
export interface ProcessInfo {
  pid: number;
  command: string;
  cpu: string;
  memory: string;
}
export interface TerminalSession {
  pid: number;
  process: ChildProcess;
  outputLines: string[];
  lastReadIndex: number;
  isBlocked: boolean;
  startTime: Date;
}
export interface CommandExecutionResult {
  pid: number;
  output: string;
  isBlocked: boolean;
  timingInfo?: TimingInfo;
}
export interface TimingInfo {
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  exitReason: "early_exit_quick_pattern" | "early_exit_periodic_check" | "process_exit" | "timeout";
  firstOutputTime?: number;
  lastOutputTime?: number;
  timeToFirstOutputMs?: number;
  outputEvents?: OutputEvent[];
}
export interface OutputEvent {
  timestamp: number;
  deltaMs: number;
  source: "stdout" | "stderr" | "periodic_poll";
  length: number;
  snippet: string;
  matchedPattern?: string;
}
export interface ActiveSession {
  pid: number;
  isBlocked: boolean;
  runtime: number;
}
export interface CompletedSession {
  pid: number;
  output: string;
  exitCode: number | null;
  startTime: Date;
  endTime: Date;
}
export interface ServerResponseContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}
export type DirectoryListingEntryType = "file" | "dir" | "warning" | "denied" | "unknown";

export interface FilePreviewDirectoryEntry {
  type: DirectoryListingEntryType;
  path: string;
  text: string;
}
export interface FilePreviewStructuredContent {
  fileName: string;
  filePath: string;
  fileType: PreviewFileType;
  imageData?: string;
  mimeType?: string;
  textContent?: string;
  entries?: FilePreviewDirectoryEntry[];
  listing?: string;
}
export interface ServerResult {
  content: ServerResponseContent[];
  structuredContent?: FilePreviewStructuredContent | Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}
export type ToolHandler<T = unknown> = (args: T) => Promise<ServerResult>;
