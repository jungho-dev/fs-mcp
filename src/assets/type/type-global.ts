import type { FilteredStdioServerTransport as FltStSrTr } from "@cores/transport/transport-stdio-transport";

declare global {
  var mcpTransport: FltStSrTr | undefined;
}
