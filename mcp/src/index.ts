#!/usr/bin/env node
/**
 * Gloam MCP server, over stdio.
 *
 * Private execution tools for AI agents across Gloam's networks: private
 * stablecoin payments on Tempo and private trading on Robinhood Chain. The
 * tools live in src/server.ts; this file only connects them to stdio.
 *
 * Money-moving tools pass the owner's spending limits first (src/policy.ts,
 * src/spendGuard.ts). Note secrets stay inside this server in an encrypted
 * store (src/noteStore.ts); the agent works with note handles.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGloamServer } from "./server.js";

async function main() {
  const server = createGloamServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP transport
  console.error("Gloam MCP server running on stdio.");
  if (process.env.GLOAM_EXPOSE_NOTE_SECRETS?.trim() === "1") {
    console.error("WARNING: GLOAM_EXPOSE_NOTE_SECRETS=1. Note secrets are passed to and from the agent. This is unsafe.");
  }
}

main().catch((err) => {
  console.error("Gloam MCP fatal error:", err);
  process.exit(1);
});
