/**
 * @file src/features/process/repl-detector.ts
 * @description REPL prompt detection helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

/**
 * REPL and Process State Detection Utilities
 * Detects when processes are waiting for input vs finished vs running
 */

export interface ProcessState {
  isWaitingForInput: boolean;
  isFinished: boolean;
  isRunning: boolean;
  detectedPrompt?: string;
  lastOutput: string;
}
// Common REPL prompt patterns
const REPL_PROMPTS = {
  python: [">>> ", "... "],
  node: ["> ", "... "],
  r: ["> ", "+ "],
  julia: ["julia> ", "       "], // julia continuation is spaces
  shell: ["$ ", "# ", "% ", "bash-", "zsh-"],
  mysql: ["mysql> ", "    -> "],
  postgres: ["=# ", "-# "],
  redis: ["redis> "],
  mongo: ["> ", "... "],
};

// Error patterns that indicate completion (even with errors)
const ERROR_COMPLETION_PATTERNS = [
  /Error:/i,
  /Exception:/i,
  /Traceback/i,
  /SyntaxError/i,
  /NameError/i,
  /TypeError/i,
  /ValueError/i,
  /ReferenceError/i,
  /Uncaught/i,
  /at Object\./i, // Node.js stack traces
  /^\s*\^/m, // Syntax error indicators
];

// Process completion indicators
const COMPLETION_INDICATORS = [/Process finished/i, /Command completed/i, /Process completed/i, /Program terminated/i, /Exit code:/i];

const OUTPUT_LINE_SEPARATOR = "\n";
const INPUT_ECHO_SUFFIX_PATTERN = "\\s*\\n?";
const PROMPT_CLEANUP_PATTERNS = [/^>>>\s*/gm, /^>\s*/gm, /^\.{3}\s*/gm, /^\+\s*/gm];
const TRAILING_PROMPT_PATTERNS = [/\n>>>\s*$/, /\n>\s*$/, /\n\+\s*$/];
const REGEXP_SPECIAL_CHAR_PATTERN = /[.*+?^${}()|[\]\\]/g;

// 1. Process state analysis ――――――――――――――――――――――――――――――――――――――
export function analyzeProcessState(output: string, _pid?: number): ProcessState {
  if (!output || output.trim().length === 0) {
    return {
      isWaitingForInput: false,
      isFinished: false,
      isRunning: true,
      lastOutput: output,
    };
  }
  const lines = output.split(OUTPUT_LINE_SEPARATOR);
  const lastLine = lines.at(-1) || "";
  const lastFewLines = lines.slice(-3).join(OUTPUT_LINE_SEPARATOR);

  // Check for REPL prompts (waiting for input)
  const allPrompts = Object.values(REPL_PROMPTS).flat();
  const detectedPrompt = allPrompts.find((prompt) => lastLine.endsWith(prompt) || lastLine.includes(prompt));

  if (detectedPrompt) {
    return {
      isWaitingForInput: true,
      isFinished: false,
      isRunning: true,
      detectedPrompt,
      lastOutput: output,
    };
  }
  // Check for completion indicators
  const hasCompletionIndicator = COMPLETION_INDICATORS.some((pattern) => pattern.test(output));

  if (hasCompletionIndicator) {
    return {
      isWaitingForInput: false,
      isFinished: true,
      isRunning: false,
      lastOutput: output,
    };
  }
  // Check for error completion (errors usually end with prompts, but let's be thorough)
  const hasErrorCompletion = ERROR_COMPLETION_PATTERNS.some((pattern) => pattern.test(lastFewLines));

  if (hasErrorCompletion) {
    // Prompted errors have already returned from the REPL prompt branch above.
    return {
      isWaitingForInput: false,
      isFinished: true,
      isRunning: false,
      lastOutput: output,
    };
  }
  // Default: process is running, not clearly waiting or finished
  return {
    isWaitingForInput: false,
    isFinished: false,
    isRunning: true,
    lastOutput: output,
  };
}
// 2. Output cleanup ―――――――――――――――――――――――――――――――――――――――――――――――
export function cleanProcessOutput(output: string, inputSent?: string): string {
  let cleaned = output;

  if (inputSent) {
    for (const line of inputSent.split(OUTPUT_LINE_SEPARATOR)) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
      	continue;
      }
      cleaned = cleaned.replace(new RegExp(`^${escapeRegExp(trimmedLine)}${INPUT_ECHO_SUFFIX_PATTERN}`, "m"), "");
    }
  }
  for (const pattern of PROMPT_CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  for (const pattern of TRAILING_PROMPT_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}
// 3. Regex literal escaping ―――――――――――――――――――――――――――――――――――――――
function escapeRegExp(string: string): string {
  return string.replace(REGEXP_SPECIAL_CHAR_PATTERN, "\\$&");
}
// 4. User-facing state message ―――――――――――――――――――――――――――――――――――――
export function formatProcessStateMessage(state: ProcessState, pid: number): string {
  if (state.isWaitingForInput) {
    return `Process ${pid} is waiting for input${state.detectedPrompt ? ` (detected: "${state.detectedPrompt.trim()}")` : ""}`;
  }
  if (state.isFinished) {
    return `Process ${pid} has finished execution`;
  }
  return `Process ${pid} is running`;
}
