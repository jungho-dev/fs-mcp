/**
 * @file src/features/process/process-virtual-node-session.ts
 * @description Virtual Node.js session management for `node:local`.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {ServerResult} from "@assets/type/common";

type VirtualNodeSession = {
  pid: number;
  timeout_ms: number;
  type: "node:local";
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpRoot = path.resolve(__dirname, "..", "..");

const virtualNodeSessions = new Map<number, VirtualNodeSession>();
let virtualPidCounter = -1000;

export function startVirtualNodeSession(timeoutMs: number): ServerResult {
  const session: VirtualNodeSession = {
    pid: virtualPidCounter--,
    timeout_ms: timeoutMs,
    type: "node:local",
  };

  virtualNodeSessions.set(session.pid, session);

  return {
    content: [
      {
        text: `
          Node.js session started with PID ${session.pid} (MCP server execution)
          IMPORTANT: Each interact_with_process call runs as a FRESH script.
          State is NOT preserved between calls. Include ALL code in ONE call:
          - imports, file reading, processing, and output together.
          Available libraries:
          - All Node.js built-ins: fs, path, http, crypto, etc.
          Ready for code - send complete self-contained script via interact_with_process.
        `.trim(),
        type: "text",
      },
    ],
  };
}
export function getVirtualNodeSession(pid: number): VirtualNodeSession | undefined {
  return virtualNodeSessions.get(pid);
}
export function clearVirtualNodeSession(pid: number): boolean {
  return virtualNodeSessions.delete(pid);
}
export function listVirtualNodeSessions(): VirtualNodeSession[] {
  return Array.from(virtualNodeSessions.values());
}
export async function executeVirtualNodeCode(code: string, timeoutMs: number=30_000): Promise<ServerResult> {
  const tempFile = path.join(mcpRoot, `.mcp-exec-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);

  try {
    await fs.writeFile(tempFile, code, "utf8");

    const result = await new Promise<{stdout: string; stderr: string; exitCode: number}>((resolve) => {
      const proc = spawn(process.execPath, [tempFile], {
        cwd: mcpRoot,
        timeout: timeoutMs,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (exitCode) => {
        resolve({exitCode: exitCode ?? 1, stderr, stdout });
      });

      proc.on("error", (err) => {
        resolve({exitCode: 1, stderr: `${stderr}\n${err.message}`, stdout });
      });
    });

    await fs.unlink(tempFile).catch (() => {});

    if (result.exitCode !== 0) {
      return {
        content: [
          {
            text: `Execution failed (exit code ${result.exitCode}):\n${result.stderr}\n${result.stdout}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          text: result.stdout || "(no output)",
          type: "text",
        },
      ],
    };
  }
  catch (error) {
    await fs.unlink(tempFile).catch (() => {});

    return {
      content: [
        {
          text: `Failed to execute Node.js code: ${error instanceof Error ? error.message : String(error)}`,
          type: "text",
        },
      ],
      isError: true,
    };
  }
}
