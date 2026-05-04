import type { FilteredStdioServerTransport } from "@cores/transport/transport-stdio-transport";

declare global {
  var mcpTransport: FilteredStdioServerTransport | undefined;
}
