/**
 * @file src/features/process/process-command-policy.ts
 * @description Command execution policy.
 * @author JUNGHO
 * @since 2026-05-02
 */

import path from "node:path";
import {cfgMgr} from "@features/config/config-store";

const CMD_SPRT = [";", "&&", "||", "|", "&"] as const;
const ENV_ASSG_PAT = /\w+=\S+\s*/g;
const WHTS_PAT = /\s+/;

// 1. Command manager ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
class CommandManager {

  // 1-1. base command logging name ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  getBaseCommand(command: string): string {
    const firstToken = command.trim().split(WHTS_PAT)[0] ?? "";
    const baseCommand = firstToken.toLowerCase();

    return baseCommand;
  }

  // 1-2. command chain extraction ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  extractCommands(cmdStr: string): string[] {
    let extrCmds: string[] = [];

    try {
      const cmdSrc = cmdStr.trim();
      const commands: string[] = [];
      let inQuote = false;
      let quoteChar = "";
      let curCmd = "";
      let escaped = false;
      let index = 0;

      while (index < cmdSrc.length) {
        const char = cmdSrc[index] ?? "";

        if (char === "\\" && !escaped) {
          escaped = true;
          curCmd = `${curCmd}${char}`;
        }
        else if (escaped) {
          escaped = false;
          curCmd = `${curCmd}${char}`;
        }
        else if ((char === "\"" || char === "'") && !inQuote) {
          inQuote = true;
          quoteChar = char;
          curCmd = `${curCmd}${char}`;
        }
        else if (char === quoteChar && inQuote) {
          inQuote = false;
          quoteChar = "";
          curCmd = `${curCmd}${char}`;
        }
        else if (char === "$" && cmdSrc[index + 1] === "(") {
          const groupEnd = this.findBalancedGroupEnd(cmdSrc, index + 1);

          if (groupEnd === null) {
            curCmd = `${curCmd}${char}`;
          }
          else {
            const subContent = cmdSrc.slice(index + 2, groupEnd - 1);
            commands.push(...this.extractCommands(subContent));

            if (inQuote) {
              curCmd = `${curCmd}${cmdSrc.slice(index, groupEnd)}`;
            }

            index = groupEnd - 1;
          }
        }
        else if (char === "`") {
          const backtickEnd = this.findBacktickEnd(cmdSrc, index);

          if (backtickEnd === null) {
            curCmd = `${curCmd}${char}`;
          }
          else {
            const subContent = cmdSrc.slice(index + 1, backtickEnd);
            commands.push(...this.extractCommands(subContent));

            if (inQuote) {
              curCmd = `${curCmd}${cmdSrc.slice(index, backtickEnd + 1)}`;
            }

            index = backtickEnd;
          }
        }
        else if (inQuote) {
          curCmd = `${curCmd}${char}`;
        }
        else if (char === "(") {
          const groupEnd = this.findBalancedGroupEnd(cmdSrc, index);

          if (groupEnd === null) {
            curCmd = `${curCmd}${char}`;
          }
          else {
            const subContent = cmdSrc.slice(index + 1, groupEnd - 1);
            commands.push(...this.extractCommands(subContent));
            index = groupEnd - 1;
          }
        }
        else {
          const separator = this.findSeparator(cmdSrc, index);

          if (separator) {
            this.pushBaseCommand(commands, curCmd);
            curCmd = "";
            index += separator.length - 1;
          }
          else {
            curCmd = `${curCmd}${char}`;
          }
        }

        index++;
      }

      this.pushBaseCommand(commands, curCmd);
      extrCmds = [...new Set(commands)];
    }
    catch (_error) {

      const baseCommand = this.extractBaseCommand(cmdStr);
      extrCmds = baseCommand ? [baseCommand] : [];
    }

    return extrCmds;
  }

  // 1-3. command token normalization ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  extractBaseCommand(commandStr: string): string | null {
    let baseCommand: string | null = null;

    try {
      const wthtEnvVrs = commandStr.replace(ENV_ASSG_PAT, "").trim();

      if (wthtEnvVrs) {
        const tokens = wthtEnvVrs.split(WHTS_PAT);
        const firstToken = this.findFirstCommandToken(tokens);

        if (firstToken?.startsWith("$(") && firstToken.endsWith(")")) {
          const inner = firstToken.slice(2, -1).trim();

          if (inner) {
            const innerToken = inner.split(WHTS_PAT)[0] ?? "";
            baseCommand = innerToken ? path.basename(innerToken).toLowerCase() : null;
          }
        }
        else if (firstToken) {
          baseCommand = path.basename(firstToken).toLowerCase();
        }
      }
    }
    catch (_error) {
      baseCommand = null;
    }

    return baseCommand;
  }

  // 1-4. blocked command validation ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  async validateCommand(command: string): Promise<boolean> {
    let isAllowed = false;

    try {
      const config = await cfgMgr.getConfig();
      const blckCmds = config.blockedCommands || [];
      const extrCmds = this.extractCommands(command);
      const cmdsTVal = extrCmds.length > 0 ? extrCmds : [this.getBaseCommand(command)];

      isAllowed = cmdsTVal.every((extrCmd) => !blckCmds.includes(extrCmd));
    }
    catch (error) {
      console.error("Error validating command:", error);
      isAllowed = false;
    }

    return isAllowed;
  }

  // 1-5. balanced parenthesis range ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

  // 2. Find balanced group end ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private findBalancedGroupEnd(cmdSrc: string, opnPrnIdx: number): number | null {
    let groupEnd: number | null = null;
    let openParens = 1;
    let index = opnPrnIdx + 1;

    while (index < cmdSrc.length && openParens > 0) {
      const char = cmdSrc[index];

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

  // 1-6. backtick substitution range ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

  // 3. Find backtick end ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private findBacktickEnd(cmdSrc: string, bcktStrt: number): number | null {
    let backtickEnd: number | null = null;
    let index = bcktStrt + 1;

    while (index < cmdSrc.length && backtickEnd === null) {
      if (cmdSrc[index] === "`") {
        backtickEnd = index;
      }

      index++;
    }

    return backtickEnd;
  }

  // 1-7. command separator match ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

  // 4. Find separator ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private findSeparator(cmdSrc: string, index: number): string | null {
    let mtchSprt: string | null = null;

    for (const separator of CMD_SPRT) {
      if (mtchSprt === null && cmdSrc.startsWith(separator, index)) {
        mtchSprt = separator;
      }
    }

    return mtchSprt;
  }

  // 1-8. extracted command append ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

  // 5. Push base command ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private pushBaseCommand(commands: string[], command: string): void {
    const baseCommand = this.extractBaseCommand(command.trim());

    if (baseCommand) {
      commands.push(baseCommand);
    }
  }

  // 1-9. first executable token ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――

  // 6. Find first command token ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
  private findFirstCommandToken(tokens: string[]): string | null {
    let firstToken: string | null = null;

    for (const token of tokens) {
      const isVarTok = token.startsWith("$") && !token.startsWith("$(");
      const isSbshTok = token[0] === "(";

      if (firstToken === null && !isVarTok && !isSbshTok) {
        firstToken = token;
      }
    }

    return firstToken;
  }
}

// 2. singleton export ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
export const cmdMgr2 = new CommandManager();
export const cmdMgr = cmdMgr2;
