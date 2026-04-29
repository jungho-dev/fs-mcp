import path from 'path';

const CONFIG_DIR = 'C:/Users/jungh/.codex/mcp/commander';

// Paths relative to the config directory
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_COMMAND_TIMEOUT = 1000; // milliseconds
