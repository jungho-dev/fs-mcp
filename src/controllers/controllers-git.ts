/**
 * @file src/controllers/controllers-git.ts
 * @description MCP git tool controller.
 * @author JUNGHO
 * @since 2026-05-03
 */

import type {ServerResult} from "@assets/type/common";
import {createErrorResponse as crtErrRes} from "@cores/responses/responses-error";
import {executeGitTool as exctGtTl} from "@features/git/git-service";
import {GT_INPT_SCHS, type GitToolName} from "@schemas/schemas-git";

// 1. Handle git tool ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export async function handleGitTool(name: GitToolName, args: unknown): Promise<ServerResult> {
  let response: ServerResult;

  try {
    const parsedArgs = GT_INPT_SCHS[name].parse(args ?? {});
    response = await exctGtTl(name, parsedArgs);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    response = crtErrRes(errorMessage);
  }
  return response;
}
