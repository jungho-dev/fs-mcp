import { 
    listProcesses,
    killProcess
} from '../tools/process.mjs';

import { 
    KillProcessArgsSchema
} from '../tools/schemas.mjs';

import type { ServerResult } from '../types/index.mjs';

/**
 * Handle list_processes command
 */
export async function handleListProcesses(): Promise<ServerResult> {
    return listProcesses();
}

/**
 * Handle kill_process command
 */
export async function handleKillProcess(args: unknown): Promise<ServerResult> {
    const parsed = KillProcessArgsSchema.parse(args);
    return killProcess(parsed);
}
