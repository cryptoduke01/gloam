/**
 * The hosted Gloam MCP server (www.gloam.trade/mcp). One small low-level MCP
 * Server per HTTP request: the route is stateless, so nothing is kept between
 * calls and no session lives on the function.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { callTool, LOCAL_SERVER, SITE, TOOLS, type ToolContext } from "./tools";

export const SERVER_VERSION = "1.0.0";

const INSTRUCTIONS = [
  "Gloam is a privacy layer for onchain money: shielded balances, private payments and shareable proofs, on Tempo and Robinhood Chain testnets.",
  "This hosted server only reads and plans. It never signs, never holds funds, and never takes a private key, recovery phrase or Gloam note secret. Never ask the user for one. If the user pastes one, tell them not to share it and to treat it as exposed.",
  `Start with gloam_info. For anything that must be signed (deposits, payments, cash outs), point the user to the Gloam app (${SITE}/app) or the local server (${LOCAL_SERVER}); gloam_connect_full_agent has the install commands.`,
].join("\n");

const KNOWN = new Set(TOOLS.map((t) => t.name));

export function createHostedGloamServer(ctx: ToolContext): Server {
  const server = new Server(
    {
      name: "gloam",
      title: "Gloam",
      version: SERVER_VERSION,
      description: "Private stablecoin payments for people and agents. Hosted, read and plan only.",
      websiteUrl: SITE,
      icons: [
        { src: `${SITE}/favicon.png`, mimeType: "image/png", sizes: ["512x512"] },
        { src: `${SITE}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
      ],
    },
    { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!KNOWN.has(name)) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool "${name}". Call tools/list, or gloam_info.`);
    }
    return callTool(name, args ?? {}, ctx);
  });

  return server;
}
