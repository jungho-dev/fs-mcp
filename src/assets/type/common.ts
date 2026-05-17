/**
 * @file src/assets/type/common.ts
 * @description Shared application types.
 * @author JUNGHO
 * @since 2026-05-02
 */

import type {ChildProcess} from "node:child_process";
import type {PreviewFileType as PrvwFlTyp} from "@assets/readers/readers-filetypes";
import type {FilteredStdioServerTransport as FltStSrTr} from "@cores/transport/transport-stdio-transport";

declare global {
  var mcpTransport: FltStSrTr | undefined;
}
export declare interface ProcessInfo {
  command: string;
  cpu: string;
  memory: string;
  pid: number;
}
export declare interface TerminalSession {
  discardedLineCount: number;
  isBlocked: boolean;
  lastReadIndex: number;
  outputLines: string[];
  pid: number;
  process: ChildProcess;
  startTime: Date;
}
export declare interface CommandExecutionResult {
  isBlocked: boolean;
  output: string;
  pid: number;
  timingInfo?: TimingInfo;
}
export declare interface TimingInfo {
  endTime: number;
  exitReason: "early_exit_quick_pattern" | "early_exit_periodic_check" | "process_exit" | "timeout";
  firstOutputTime?: number;
  lastOutputTime?: number;
  outputEvents?: OutputEvent[];
  startTime: number;
  timeToFirstOutputMs?: number;
  totalDurationMs: number;
}
export declare interface OutputEvent {
  deltaMs: number;
  length: number;
  matchedPattern?: string;
  snippet: string;
  source: "stdout" | "stderr" | "periodic_poll";
  timestamp: number;
}
export declare interface ActiveSession {
  isBlocked: boolean;
  pid: number;
  runtime: number;
}
export declare interface ServerResponseContent {
  data?: string;
  mimeType?: string;
  text?: string;
  type: string;
}
export declare type DirectoryListingEntryType = "file" | "dir" | "warning" | "denied" | "unknown";

export declare interface FilePreviewDirectoryEntry {
  path: string;
  text: string;
  type: DirectoryListingEntryType;
}
export declare interface FilePreviewStructuredContent {
  entries?: FilePreviewDirectoryEntry[];
  fileName: string;
  filePath: string;
  fileType: PrvwFlTyp;
  imageData?: string;
  listing?: string;
  mimeType?: string;
  textContent?: string;
}
export declare interface ServerResult {
  _meta?: Record<string, unknown>;
  content: ServerResponseContent[];
  isError?: boolean;
  structuredContent?: FilePreviewStructuredContent | Record<string, unknown>;
}
