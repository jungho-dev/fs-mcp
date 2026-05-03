/**
 * @file src/features/process/process-command-policy.ts
 * @description Command execution policy.
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";
import {capture} from "@cores/runtime/runtime-output-capture";
import {configManager} from "@features/config/config-store";

const COMMAND_SEPARATORS = [";", "&&", "||", "|", "&"] as const;
const ENV_ASSIGNMENT_PATTERN = /\w+=\S+\s*/g;
const WHITESPACE_PATTERN = /\s+/;

// 1. command manager ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class CommandManager {
  // 1-1. base command logging name ――――――――――――――――――――――――――――――――――――――――――――――――――
  getBaseCommand(command: string): string {
    const firstToken = command.trim().split(WHITESPACE_PATTERN)[0] ?? "";
    const baseCommand = firstToken.toLowerCase();

    return baseCommand;
  }

  // 1-2. command chain extraction ――――――――――――――――――――――――――――――――――――――――――――――――――
  extractCommands(commandString: string): string[] {
    let extractedCommands: string[] = [];

    try {
      const commandSource = commandString.trim();
      const commands: string[] = [];
      let inQuote = false;
      let quoteChar = "";
      let currentCommand = "";
      let escaped = false;
      let index = 0;

      while (index < commandSource.length) {
        const char = commandSource[index] ?? "";

        if (char === "\\" && !escaped) {
          escaped = true;
          currentCommand = `${currentCommand}${char}`;
        }
        else if (escaped) {
          escaped = false;
          currentCommand = `${currentCommand}${char}`;
        }
        else if ((char === "\"" || char === "'") && !inQuote) {
          inQuote = true;
          quoteChar = char;
          currentCommand = `${currentCommand}${char}`;
        }
        else if (char === quoteChar && inQuote) {
          inQuote = false;
          quoteChar = "";
          currentCommand = `${currentCommand}${char}`;
        }
        else if (char === "$" && commandSource[index + 1] === "(") {
          const groupEnd = this.findBalancedGroupEnd(commandSource, index + 1);

          if (groupEnd === null) {
            currentCommand = `${currentCommand}${char}`;
          }
          else {
            const subContent = commandSource.slice(index + 2, groupEnd - 1);
            commands.push(...this.extractCommands(subContent));

            if (inQuote) {
              currentCommand = `${currentCommand}${commandSource.slice(index, groupEnd)}`;
            }

            index = groupEnd - 1;
          }
        }
        else if (char === "`") {
          const backtickEnd = this.findBacktickEnd(commandSource, index);

          if (backtickEnd === null) {
            currentCommand = `${currentCommand}${char}`;
          }
          else {
            const subContent = commandSource.slice(index + 1, backtickEnd);
            commands.push(...this.extractCommands(subContent));

            if (inQuote) {
              currentCommand = `${currentCommand}${commandSource.slice(index, backtickEnd + 1)}`;
            }

            index = backtickEnd;
          }
        }
        else if (inQuote) {
          currentCommand = `${currentCommand}${char}`;
        }
        else if (char === "(") {
          const groupEnd = this.findBalancedGroupEnd(commandSource, index);

          if (groupEnd === null) {
            currentCommand = `${currentCommand}${char}`;
          }
          else {
            const subContent = commandSource.slice(index + 1, groupEnd - 1);
            commands.push(...this.extractCommands(subContent));
            index = groupEnd - 1;
          }
        }
        else {
          const separator = this.findSeparator(commandSource, index);

          if (separator) {
            this.pushBaseCommand(commands, currentCommand);
            currentCommand = "";
            index += separator.length - 1;
          }
          else {
            currentCommand = `${currentCommand}${char}`;
          }
        }

        index++;
      }

      this.pushBaseCommand(commands, currentCommand);
      extractedCommands = [...new Set(commands)];
    }
    catch (_error) {
      capture("server_request_error", {
        error: "Error extracting commands",
      });

      const baseCommand = this.extractBaseCommand(commandString);
      extractedCommands = baseCommand ? [baseCommand] : [];
    }

    return extractedCommands;
  }

  // 1-3. command token normalization ――――――――――――――――――――――――――――――――――――――――――――――
  extractBaseCommand(commandStr: string): string | null {
    let baseCommand: string | null = null;

    try {
      const withoutEnvVars = commandStr.replace(ENV_ASSIGNMENT_PATTERN, "").trim();

      if (withoutEnvVars) {
        const tokens = withoutEnvVars.split(WHITESPACE_PATTERN);
        const firstToken = this.findFirstCommandToken(tokens);

        if (firstToken?.startsWith("$(") && firstToken.endsWith(")")) {
          const inner = firstToken.slice(2, -1).trim();

          if (inner) {
            const innerToken = inner.split(WHITESPACE_PATTERN)[0] ?? "";
            baseCommand = innerToken ? path.basename(innerToken).toLowerCase() : null;
          }
        }
        else if (firstToken) {
          baseCommand = path.basename(firstToken).toLowerCase();
        }
      }
    }
    catch (_error) {
      capture("Error extracting base command");
      baseCommand = null;
    }

    return baseCommand;
  }

  // 1-4. blocked command validation ―――――――――――――――――――――――――――――――――――――――――――――――
  async validateCommand(command: string): Promise<boolean> {
    let isAllowed = false;

    try {
      const config = await configManager.getConfig();
      const blockedCommands = config.blockedCommands || [];
      const extractedCommands = this.extractCommands(command);
      const commandsToValidate = extractedCommands.length > 0 ? extractedCommands : [this.getBaseCommand(command)];

      isAllowed = commandsToValidate.every((extractedCommand) => !blockedCommands.includes(extractedCommand));
    }
    catch (error) {
      console.error("Error validating command:", error);
      capture("server_validate_command_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      isAllowed = false;
    }

    return isAllowed;
  }

  // 1-5. balanced parenthesis range ―――――――――――――――――――――――――――――――――――――――――――――――
  private findBalancedGroupEnd(commandSource: string, openParenIndex: number): number | null {
    let groupEnd: number | null = null;
    let openParens = 1;
    let index = openParenIndex + 1;

    while (index < commandSource.length && openParens > 0) {
      const char = commandSource[index];

      if (char === "(") {
        openParens++;
      }

      if (char === ")") {
        openParens--;
      }

      index++;
    }

    if (openParens === 0) {
      groupEnd = index;
    }

    return groupEnd;
  }

  // 1-6. backtick substitution range ――――――――――――――――――――――――――――――――――――――――――――――
  private findBacktickEnd(commandSource: string, backtickStart: number): number | null {
    let backtickEnd: number | null = null;
    let index = backtickStart + 1;

    while (index < commandSource.length && backtickEnd === null) {
      if (commandSource[index] === "`") {
        backtickEnd = index;
      }

      index++;
    }

    return backtickEnd;
  }

  // 1-7. command separator match ――――――――――――――――――――――――――――――――――――――――――――――――――
  private findSeparator(commandSource: string, index: number): string | null {
    let matchedSeparator: string | null = null;

    for (const separator of COMMAND_SEPARATORS) {
      if (matchedSeparator === null && commandSource.startsWith(separator, index)) {
        matchedSeparator = separator;
      }
    }

    return matchedSeparator;
  }

  // 1-8. extracted command append ―――――――――――――――――――――――――――――――――――――――――――――――――
  private pushBaseCommand(commands: string[], command: string): void {
    const baseCommand = this.extractBaseCommand(command.trim());

    if (baseCommand) {
      commands.push(baseCommand);
    }
  }

  // 1-9. first executable token ―――――――――――――――――――――――――――――――――――――――――――――――――――
  private findFirstCommandToken(tokens: string[]): string | null {
    let firstToken: string | null = null;

    for (const token of tokens) {
      const isVariableToken = token.startsWith("$") && !token.startsWith("$(");
      const isSubshellToken = token[0] === "(";

      if (firstToken === null && !isVariableToken && !isSubshellToken) {
        firstToken = token;
      }
    }

    return firstToken;
  }
}

// 2. singleton export ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const commandManager = new CommandManager();
