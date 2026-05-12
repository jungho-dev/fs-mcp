#!/usr/bin/env bun
/**
 * @file src/index.mts
 * @description MCP server bootstrap entrypoint.
 * @author JUNGHO
 * @since 2026-05-02
 */

import { startServer } from "@cores/server/server-run-mcp-server";

startServer();
