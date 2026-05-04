import type { FilteredStdioServerTransport } from "../utils/stdio-transport.mjs";

export {};

declare global {
  var mcpTransport: FilteredStdioServerTransport | undefined;
}

declare module "caffeinate" {
  interface CaffeinateOptions {
    pid?: number;
    timeout?: number;
  }

  function caffeinate(options?: CaffeinateOptions): Promise<number>;

  export default caffeinate;
}
