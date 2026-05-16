/**
 * @file src/features/process/process-repl-detector.ts
 * @description REPL prompt detection helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

// 1. REPL and Process State Detection Utilities ―――――――――――――――――――――――――――――――――――――――――――――――――――
// Detects when processes are waiting for input vs finished vs running

export interface ProcessState {
  detectedPrompt?: string;
  isFinished: boolean;
  isRunning: boolean;
  isWaitingForInput: boolean;
  lastOutput: string;
}

// Common REPL prompt patterns
const REPL_PROMPTS = {
  julia: ["julia> ", "       "], // julia continuation is spaces
  mongo: ["> ", "... "],
  mysql: ["mysql> ", "    -> "],
  node: ["> ", "... "],
  postgres: ["=# ", "-# "],
  python: [">>> ", "... "],
  r: ["> ", "+ "],
  redis: ["redis> "],
  shell: ["$ ", "# ", "% ", "bash-", "zsh-"],
};

// Error patterns that indicate completion (even with errors)
const ERR_CMP_PAT = [
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
const CMPL_INDC = [/Process finished/i, /Command completed/i, /Process completed/i, /Program terminated/i, /Exit code:/i];

const OTPT_LN_SPRT = "\n";
const IESP = "\\s*\\n?";
const PRM_CLN_PAT = [/^>>>\s*/gm, /^>\s*/gm, /^\.{3}\s*/gm, /^\+\s*/gm];
const TRL_PRM_PAT = [/\n>>>\s*$/, /\n>\s*$/, /\n\+\s*$/];
const RSCP = /[.*+?^${}()|[\]\\]/g;

// 1. Analyze process state ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function analyzeProcessState(output: string, _pid?: number): ProcessState {
  if (!output || output.trim().length === 0) {
    return {
      isFinished: false,
      isRunning: true,
      isWaitingForInput: false,
      lastOutput: output,
    };
  }
  const lines = output.split(OTPT_LN_SPRT);
  const lastLine = lines.at(-1) || "";
  const lastFewLines = lines.slice(-3).join(OTPT_LN_SPRT);

  // Check for REPL prompts (waiting for input)
  const allPrompts = Object.values(REPL_PROMPTS).flat();
  const dtctPrmp = allPrompts.find((prompt) => lastLine.endsWith(prompt) || lastLine.includes(prompt));

  if (dtctPrmp) {
    return {
      detectedPrompt: dtctPrmp,
      isFinished: false,
      isRunning: true,
      isWaitingForInput: true,
      lastOutput: output,
    };
  }
  // Check for completion indicators
  const hsCmplIndc = CMPL_INDC.some((pattern) => pattern.test(output));

  if (hsCmplIndc) {
    return {
      isFinished: true,
      isRunning: false,
      isWaitingForInput: false,
      lastOutput: output,
    };
  }
  // Check for error completion (errors usually end with prompts, but let's be thorough)
  const hsErrCmpl = ERR_CMP_PAT.some((pattern) => pattern.test(lastFewLines));

  if (hsErrCmpl) {
    // Prompted errors have already returned from the REPL prompt branch above.
    return {
      isFinished: true,
      isRunning: false,
      isWaitingForInput: false,
      lastOutput: output,
    };
  }
  // Default: process is running, not clearly waiting or finished
  return {
    isFinished: false,
    isRunning: true,
    isWaitingForInput: false,
    lastOutput: output,
  };
}

// 2. Clean process output ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function cleanProcessOutput(output: string, inputSent?: string): string {
  let cleaned = output;

  if (inputSent) {
    for (const line of inputSent.split(OTPT_LN_SPRT)) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }
      cleaned = cleaned.replace(new RegExp(`^${escapeRegExp(trimmedLine)}${IESP}`, "m"), "");
    }
  }
  for (const pattern of PRM_CLN_PAT) {
    cleaned = cleaned.replace(pattern, "");
  }
  for (const pattern of TRL_PRM_PAT) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

// 3. Escape reg exp ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
function escapeRegExp(string: string): string {
  return string.replace(RSCP, "\\$&");
}

// 4. Format process state message ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export function formatProcessStateMessage(state: ProcessState, pid: number): string {
  if (state.isWaitingForInput) {
    return `Process ${pid} is waiting for input${state.detectedPrompt ? ` (detected: "${state.detectedPrompt.trim()}")` : ""}`;
  }
  if (state.isFinished) {
    return `Process ${pid} has finished execution`;
  }
  return `Process ${pid} is running`;
}
