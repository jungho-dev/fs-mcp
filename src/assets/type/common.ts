/**
 * @file src/assets/type/common.ts
 * @description Shared application types.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ChildProcess} from "node:child_process";
import type {PreviewFileType} from "@assets/readers/readers-filetypes";
import type {FilteredStdioServerTransport} from "@cores/transport/transport-stdio-transport";

declare global {
  var mcpTransport: FilteredStdioServerTransport | undefined;
}
export interface ProcessInfo {
  command: string;
  cpu: string;
  memory: string;
  pid: number;
}
export interface TerminalSession {
  discardedLineCount: number;
  isBlocked: boolean;
  lastReadIndex: number;
  outputLines: string[];
  pid: number;
  process: ChildProcess;
  startTime: Date;
}
export interface CommandExecutionResult {
  isBlocked: boolean;
  output: string;
  pid: number;
  timingInfo?: TimingInfo;
}
export interface TimingInfo {
  endTime: number;
  exitReason: "early_exit_quick_pattern" | "early_exit_periodic_check" | "process_exit" | "timeout";
  firstOutputTime?: number;
  lastOutputTime?: number;
  outputEvents?: OutputEvent[];
  startTime: number;
  timeToFirstOutputMs?: number;
  totalDurationMs: number;
}
export interface OutputEvent {
  deltaMs: number;
  length: number;
  matchedPattern?: string;
  snippet: string;
  source: "stdout" | "stderr" | "periodic_poll";
  timestamp: number;
}
export interface ActiveSession {
  isBlocked: boolean;
  pid: number;
  runtime: number;
}
export interface ServerResponseContent {
  data?: string;
  mimeType?: string;
  text?: string;
  type: string;
}
export type DirectoryListingEntryType = "file" | "dir" | "warning" | "denied" | "unknown";

export interface FilePreviewDirectoryEntry {
  path: string;
  text: string;
  type: DirectoryListingEntryType;
}
export interface FilePreviewStructuredContent {
  entries?: FilePreviewDirectoryEntry[];
  fileName: string;
  filePath: string;
  fileType: PreviewFileType;
  imageData?: string;
  listing?: string;
  mimeType?: string;
  textContent?: string;
}
export interface ServerResult {
  _meta?: Record<string, unknown>;
  content: ServerResponseContent[];
  isError?: boolean;
  structuredContent?: FilePreviewStructuredContent | Record<string, unknown>;
}
