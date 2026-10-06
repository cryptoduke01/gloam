import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { clientIp, hitRateLimit } from "@/lib/mcpRemote/rateLimit";
import { createHostedGloamServer } from "@/lib/mcpRemote/server";
import { SITE } from "@/lib/mcpRemote/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Gloam's hosted MCP server: https://www.gloam.trade/mcp
 *
 * Paste the URL into Claude (Settings, Connectors, Add custom connector),
 * ChatGPT connectors, Cursor or any MCP client; nothing to install. Streamable
 * HTTP, stateless: every POST gets a fresh server, answers in JSON, and keeps
 * nothing. There are no sessions, so GET (an SSE stream) and DELETE (ending a
 * session) answer 405, as the spec allows.
 *
 * Read and plan only. It never signs, never holds funds and refuses any tool
 * call that looks like it carries a key or note secret (lib/mcpRemote).
 */

const REQUESTS_PER_MINUTE = 120;
const MAX_BODY_BYTES = 600_000;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate, Retry-After",
  "Access-Control-Max-Age": "86400",
};

function withHeaders(res: Response, extra?: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...CORS, "Cache-Control": "no-store", ...extra })) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function rpcError(status: number, code: number, message: string, extra?: Record<string, string>): Response {
  return withHeaders(Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status }), extra);
}

/** Links point at the live site, or at this dev server on localhost. */
function linkOrigin(req: Request): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  const name = host.replace(/:\d+$/, "");
  if (name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name.endsWith(".localhost")) return `http://${host}`;
  return SITE;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await hitRateLimit(ip, "req", REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return rpcError(429, -32000, `Too many requests. Try again in ${rl.retryAfterSec} seconds.`, {
      "Retry-After": String(rl.retryAfterSec),
    });
  }

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return rpcError(413, -32600, "Request too large.");
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");
    body = JSON.parse(text);
  } catch {
    return rpcError(400, -32700, "Parse error: send a JSON-RPC message as JSON.");
  }

  // The body is parsed here, so be lenient about Accept and Content-Type:
  // answers are always JSON, which every Streamable HTTP client takes.
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const forward = new Request(req.url, { method: "POST", headers });

  const server = createHostedGloamServer({ origin: linkOrigin(req), ip });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return withHeaders(await transport.handleRequest(forward, { parsedBody: body }));
  } catch (e) {
    console.error("gloam_mcp", e instanceof Error ? e.name : "error");
    return rpcError(500, -32603, "Internal error.");
  } finally {
    await server.close().catch(() => {});
  }
}

export async function GET(req: Request) {
  const accept = req.headers.get("accept") ?? "";
  // A person opening the URL in a browser gets the setup docs.
  if (accept.includes("text/html") && !accept.includes("text/event-stream")) {
    return withHeaders(Response.redirect(`${linkOrigin(req)}/docs/agents#connect-by-url`, 307));
  }
  return rpcError(405, -32000, "Method not allowed. This server is stateless: POST JSON-RPC messages to this URL.", {
    Allow: "POST, OPTIONS",
  });
}

export async function DELETE() {
  return rpcError(405, -32000, "Method not allowed. This server keeps no sessions.", { Allow: "POST, OPTIONS" });
}

export async function OPTIONS() {
  return withHeaders(new Response(null, { status: 204 }));
}
