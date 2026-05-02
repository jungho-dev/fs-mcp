/**
 * @file src/mcp/tools/catalog/process-tools.mts
 * @description Process and session tool catalog entries.
 * @author JUNGHO
 * @since 2026-05-03
 */

import {zodToJsonSchema} from "zod-to-json-schema";
import {ForceTerminateArgsSchema, InteractWithProcessArgsSchema, KillProcessArgsSchema, ListProcessesArgsSchema, ListSessionsArgsSchema, ReadProcessOutputArgsSchema, StartProcessArgsSchema} from "@mcp/schemas/schema-exports";
import {CMD_PREFIX_DESCRIPTION, OS_GUIDANCE, PATH_GUIDANCE, type ToolCatalogEntry} from "@mcp/tools/catalog/catalog-shared";

export const PROCESS_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Terminal tools
  {
    name: "start_process",
    description: `
                Start a new terminal process with intelligent state detection.

                PRIMARY TOOL FOR FILE ANALYSIS AND DATA PROCESSING
                This is the ONLY correct tool for analyzing local files (CSV, JSON, logs, etc.).
                The analysis tool CANNOT access local files and WILL FAIL - always use processes for file-based work.

                CRITICAL RULE: For ANY local file work, ALWAYS use this tool + interact_with_process, NEVER use analysis/REPL tool.

                ${OS_GUIDANCE}
                REQUIRED WORKFLOW FOR LOCAL FILES:
                1. start_process("python3 -i") - Start Python REPL for data analysis
                2. interact_with_process(pid, "import pandas as pd, numpy as np")
                3. interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
                4. interact_with_process(pid, "print(df.describe())")
                5. Continue analysis with pandas, matplotlib, seaborn, etc.

                COMMON FILE ANALYSIS PATTERNS:
                • start_process("python3 -i") → Python REPL for data analysis (RECOMMENDED)
                • start_process("node -i") → Node.js REPL for JSON processing
                • start_process("node:local") → Node.js on MCP server (stateless, ES imports, all code in one call)
                • start_process("cut -d',' -f1 file.csv | sort | uniq -c") → Quick CSV analysis
                • start_process("wc -l /path/file.csv") → Line counting
                • start_process("head -10 /path/file.csv") → File preview

                BINARY FILE SUPPORT:
                For Word, archives, databases, and other binary formats, use process tools with appropriate libraries or command-line utilities.

                INTERACTIVE PROCESSES FOR DATA ANALYSIS:
                For code/calculations, use in this priority order:
                1. start_process("python3 -i") - Python REPL (preferred)
                2. start_process("node -i") - Node.js REPL (when Python unavailable)
                3. start_process("node:local") - Node.js fallback (when node -i fails)
                4. Use interact_with_process() to send commands
                5. Use read_process_output() to get responses
                When Python is unavailable, prefer Node.js over shell for calculations.
                Node.js: Always use ES import syntax (import x from 'y'), not require().

                SMART DETECTION:
                - Detects REPL prompts (>>>, >, $, etc.)
                - Identifies when process is waiting for input
                - Recognizes process completion vs timeout
                - Early exit prevents unnecessary waiting

                STATES DETECTED:
                Process waiting for input (shows prompt)
                Process finished execution
                Process running (use read_process_output)

                PERFORMANCE DEBUGGING (verbose_timing parameter):
                Set verbose_timing: true to get detailed timing information including:
                - Exit reason (early_exit_quick_pattern, early_exit_periodic_check, process_exit, timeout)
                - Total duration and time to first output
                - Complete timeline of all output events with timestamps
                - Which detection mechanism triggered early exit
                Use this to identify missed optimization opportunities and improve detection patterns.

                ALWAYS USE FOR: Local file analysis, CSV processing, data exploration, system commands
                NEVER USE ANALYSIS TOOL FOR: Local file access (analysis tool is browser-only and WILL FAIL)

                ${PATH_GUIDANCE}
                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(StartProcessArgsSchema),
    annotations: {
      title: "Start Terminal Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "read_process_output",
    description: `
                Read output from a running process with file-like pagination support.

                Supports partial output reading with offset and length parameters (like read_file):
                - 'offset' (start line, default: 0)
                  * offset=0: Read NEW output since last read (default, like old behavior)
                  * Positive: Read from absolute line position
                  * Negative: Read last N lines from end (tail behavior)
                - 'length' (max lines to read, default: configurable via 'fileReadLineLimit' setting)

                Examples:
                - offset: 0, length: 100     → First 100 NEW lines since last read
                - offset: 0                  → All new lines (respects config limit)
                - offset: 500, length: 50    → Lines 500-549 (absolute position)
                - offset: -20                → Last 20 lines (tail)
                - offset: -50, length: 10    → Start 50 from end, read 10 lines

                OUTPUT PROTECTION:
                - Uses same fileReadLineLimit as read_file (default: 1000 lines)
                - Returns status like: Reading 100 lines from line 0 (total: 5000 lines, 4900 remaining)
                - Prevents context overflow from verbose processes

                SMART FEATURES:
                - For offset=0, waits up to timeout_ms for new output to arrive
                - Detects REPL prompts and process completion
                - Shows process state (waiting for input, finished, etc.)

                DETECTION STATES:
                Process waiting for input (ready for interact_with_process)
                Process finished execution
                Timeout reached (may still be running)

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ReadProcessOutputArgsSchema),
    annotations: {
      title: "Read Process Output",
      readOnlyHint: true,
    },
  },
  {
    name: "interact_with_process",
    description: `
                Send input to a running process and automatically receive the response.

                CRITICAL: THIS IS THE PRIMARY TOOL FOR ALL LOCAL FILE ANALYSIS
                For ANY local file analysis (CSV, JSON, data processing), ALWAYS use this instead of the analysis tool.
                The analysis tool CANNOT access local files and WILL FAIL - use processes for ALL file-based work.

                FILE ANALYSIS PRIORITY ORDER (MANDATORY):
                1. ALWAYS FIRST: Use this tool (start_process + interact_with_process) for local data analysis
                2. ALTERNATIVE: Use command-line tools (cut, awk, grep) for quick processing
                3. NEVER EVER: Use analysis tool for local file access (IT WILL FAIL)

                REQUIRED INTERACTIVE WORKFLOW FOR FILE ANALYSIS:
                1. Start REPL: start_process("python3 -i")
                2. Load libraries: interact_with_process(pid, "import pandas as pd, numpy as np")
                3. Read file: interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
                4. Analyze: interact_with_process(pid, "print(df.describe())")
                5. Continue: interact_with_process(pid, "df.groupby('column').size()")

                BINARY FILE PROCESSING WORKFLOWS:
                Use appropriate Python libraries (pandas, docx2txt, etc.) or command-line tools for binary file analysis.

                SMART DETECTION:
                - Automatically waits for REPL prompt (>>>, >, etc.)
                - Detects errors and completion states
                - Early exit prevents timeout delays
                - Clean output formatting (removes prompts)

                SUPPORTED REPLs:
                - Python: python3 -i (RECOMMENDED for data analysis)
                - Node.js: node -i
                - R: R
                - Julia: julia
                - Shell: bash, zsh
                - Database: mysql, postgres

                PARAMETERS:
                - pid: Process ID from start_process
                - input: Code/command to execute
                - timeout_ms: Max wait (default: 8000ms)
                - wait_for_prompt: Auto-wait for response (default: true)
                - verbose_timing: Enable detailed timing information (default: false)

                Returns execution result with status indicators.

                PERFORMANCE DEBUGGING (verbose_timing parameter):
                Set verbose_timing: true to get detailed timing information including:
                - Exit reason (early_exit_quick_pattern, early_exit_periodic_check, process_finished, timeout, no_wait)
                - Total duration and time to first output
                - Complete timeline of all output events with timestamps
                - Which detection mechanism triggered early exit
                Use this to identify slow interactions and optimize detection patterns.

                ALWAYS USE FOR: CSV analysis, JSON processing, file statistics, data visualization prep, ANY local file work
                NEVER USE ANALYSIS TOOL FOR: Local file access (it cannot read files from disk and WILL FAIL)

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(InteractWithProcessArgsSchema),
    annotations: {
      title: "Send Input to Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "force_terminate",
    description: `
                Force terminate a running terminal session.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ForceTerminateArgsSchema),
    annotations: {
      title: "Force Terminate Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "list_sessions",
    description: `
                List all active terminal sessions.

                Shows session status including:
                - PID: Process identifier
                - Blocked: Whether session is waiting for input
                - Runtime: How long the session has been running

                DEBUGGING REPLs:
                - "Blocked: true" often means REPL is waiting for input
                - Use this to verify sessions are running before sending input
                - Long runtime with blocked status may indicate stuck process

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ListSessionsArgsSchema),
    annotations: {
      title: "List Terminal Sessions",
      readOnlyHint: true,
    },
  },
  {
    name: "list_processes",
    description: `
                List all running processes.

                Returns process information including PID, command name, CPU usage, and memory usage.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(ListProcessesArgsSchema),
    annotations: {
      title: "List Running Processes",
      readOnlyHint: true,
    },
  },
  {
    name: "kill_process",
    description: `
                Terminate a running process by PID.

                Use with caution as this will forcefully terminate the specified process.

                ${CMD_PREFIX_DESCRIPTION}`,
    inputSchema: zodToJsonSchema(KillProcessArgsSchema),
    annotations: {
      title: "Kill Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];
