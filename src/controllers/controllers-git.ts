/**
 * @file src/controllers/controllers-git.ts
 * @description MCP git tool controller.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {ServerResult} from "@assets/type/common";
import {createErrorResponse} from "@cores/responses/responses-error";
import {executeGitTool} from "@features/git/git-service";
import {GIT_INPUT_SCHEMAS, type GitToolName} from "@schemas/schemas-git";

// 1. Handle git tool ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGitTool(name: GitToolName, args: unknown): Promise<ServerResult> {
  let response: ServerResult;

  try {
    const parsedArgs = GIT_INPUT_SCHEMAS[name].parse(args ?? {});
    response = await executeGitTool(name, parsedArgs);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    response = createErrorResponse(errorMessage);
  }
  return response;
}
