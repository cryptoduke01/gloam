// Starts a built server as an MCP client would, lists its tools, and exits.
// Usage: node scripts/smoke-stdio.mjs [command args...]   (default: node dist/index.js)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const given = process.argv.slice(2);
const [command, ...args] = given.length ? given : [process.execPath, new URL("../dist/index.js", import.meta.url).pathname];
const transport = new StdioClientTransport({
  command,
  args,
  env: { ...process.env },
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (d) => (stderr += d));
const client = new Client({ name: "gloam-smoke", version: "0" });
await client.connect(transport);
const { tools } = await client.listTools();
const info = await client.callTool({ name: "gloam_get_limits", arguments: {} }).catch((e) => ({ error: String(e) }));
await client.close();
console.log(JSON.stringify({ server: client.getServerVersion(), tools: tools.map((t) => t.name), getLimits: info.content?.[0]?.text?.slice(0, 200) ?? info, stderr: stderr.trim().split("\n") }, null, 2));
