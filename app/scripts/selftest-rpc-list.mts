/**
 * Self-test: a chain's public RPCs as one list (lib/rpcList, 26 Oct 2026).
 *
 * Before, the app and the server read every chain through its first public
 * RPC only: one RPC down or slow and every read on that chain failed or
 * waited out its retries, while the second RPC listed for it sat unused.
 *
 *  - a node that fails (503, dropped connection, timeout, 429) rests: the
 *    read goes on to the next RPC at once, the next reads skip it, and after
 *    the rest it is asked first again;
 *  - each RPC is asked once a pass (a hung node costs one timeout);
 *  - a JSON-RPC answer about the request (a range it does not serve) goes on
 *    to the next RPC without resting the first; a revert is final;
 *  - with every RPC resting they are all asked again, so the list never
 *    refuses a read by itself;
 *  - a log read never goes to an RPC in NO_LOG_RPCS;
 *  - with sendTo "one" a send goes to exactly one RPC, never on to another,
 *    and a node that failed a send rests, so the next send goes elsewhere;
 *  - the app's read client and the server transport read through the list.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-rpc-list.mts
 */
import assert from "node:assert/strict";
import { createPublicClient, toHex, type Hex } from "viem";

const A = "https://a.selftest.invalid";
const B = "https://b.selftest.invalid";
const C = "https://c.selftest.invalid";
const NOLOGS = "https://sepolia.base.org";

type Mode = "ok" | "503" | "drop" | "hang" | "429" | "range" | "revert";
const modes = new Map<string, Mode>();
const asked: string[] = [];
type RpcReq = { id: number; method: string; params?: unknown[] };

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = (typeof input === "string" ? input : input instanceof URL ? input.href : input.url).replace(/\/$/, "");
  const body = JSON.parse(String(init?.body)) as RpcReq | RpcReq[];
  const list = Array.isArray(body) ? body : [body];
  const host = url === NOLOGS ? "nologs" : new URL(url).host.split(".")[0]!;
  asked.push(...list.map((r) => `${host}:${r.method}`));
  const mode = modes.get(url) ?? "ok";
  if (mode === "503") return new Response("busy", { status: 503 });
  if (mode === "429") return new Response("slow down", { status: 429 });
  if (mode === "drop") throw new TypeError("fetch failed");
  if (mode === "hang") {
    return new Promise<Response>((_, reject) => {
      const s = init?.signal;
      if (s?.aborted) return reject(s.reason);
      s?.addEventListener("abort", () => reject(s.reason ?? new Error("aborted")));
    });
  }
  const out = list.map((r) => {
    if (mode === "range") return { jsonrpc: "2.0", id: r.id, error: { code: -32602, message: "exceed maximum block range: 50000" } };
    if (mode === "revert") return { jsonrpc: "2.0", id: r.id, error: { code: 3, message: "execution reverted", data: "0x" } };
    if (r.method === "eth_chainId") return { jsonrpc: "2.0", id: r.id, result: toHex(84532) };
    if (r.method === "eth_sendRawTransaction") return { jsonrpc: "2.0", id: r.id, result: "0x" + "ab".repeat(32) };
    if (r.method === "eth_getLogs") return { jsonrpc: "2.0", id: r.id, result: [] };
    return { jsonrpc: "2.0", id: r.id, result: toHex(host === "a" ? 1 : host === "b" ? 2 : host === "c" ? 3 : 9) };
  });
  return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const { REST_MS, isResting, resetRpcRest, restRpc, rpcListTransport, rpcOrder } = await import("../src/lib/rpcList");

let pass = 0;
async function ok(name: string, fn: () => Promise<void> | void) {
  asked.length = 0;
  modes.clear();
  resetRpcRest();
  await fn();
  pass++;
  console.log(`ok  ${name}`);
}
const t = (urls: string[], cfg = {}, opts = {}) => rpcListTransport(urls, { timeout: 300, ...cfg }, opts)({});
const blockNumber = (tr: ReturnType<typeof t>) => tr.request({ method: "eth_blockNumber" }) as Promise<Hex>;

await ok("a node that fails rests: the read goes on at once, later reads skip it, after the rest it is first again", async () => {
  for (const m of ["503", "drop", "429", "hang"] as const) {
    resetRpcRest();
    asked.length = 0;
    modes.set(A, m);
    const tr = t([A, B, C], { retryCount: 2 });
    const t0 = Date.now();
    assert.equal(await blockNumber(tr), "0x2", m);
    assert.deepEqual(asked, ["a:eth_blockNumber", "b:eth_blockNumber"], `${m}: asked once, not once per retry`);
    assert.ok(Date.now() - t0 < 1_500, `${m}: took ${Date.now() - t0} ms`);
    assert.equal(isResting(A), true);
    asked.length = 0;
    assert.equal(await blockNumber(tr), "0x2");
    assert.deepEqual(asked, ["b:eth_blockNumber"], `${m}: a resting node is not asked`);
    // after the rest
    assert.equal(isResting(A, Date.now() + REST_MS + 1), false);
    modes.delete(A);
  }
  resetRpcRest();
  assert.equal(await blockNumber(t([A, B, C])), "0x1");
});

await ok("a JSON-RPC answer about the request goes on to the next RPC without resting the first; a revert is final", async () => {
  modes.set(A, "range");
  assert.equal(await blockNumber(t([A, B])), "0x2");
  assert.equal(isResting(A), false);
  modes.set(A, "revert");
  await assert.rejects(t([A, B]).request({ method: "eth_call", params: [{ to: A, data: "0x" }, "latest"] }), /revert/i);
  assert.ok(!asked.includes("b:eth_call"), "a revert is never asked of the next RPC");
  // every RPC answers the request is wrong: one pass, the last answer, no retries
  asked.length = 0;
  modes.set(A, "range");
  modes.set(B, "range");
  await assert.rejects(blockNumber(t([A, B], { retryCount: 3 })), /block range/);
  assert.deepEqual(asked, ["a:eth_blockNumber", "b:eth_blockNumber"]);
  // the first RPC's answer is passed on, not a later node failure (a log walk splits on it)
  asked.length = 0;
  modes.set(B, "503");
  await assert.rejects(blockNumber(t([A, B], { retryCount: 3 })), /block range/);
  assert.deepEqual(asked, ["a:eth_blockNumber", "b:eth_blockNumber"]);
});

await ok("every RPC resting: all asked again in order, so the list never refuses by itself", async () => {
  modes.set(A, "503");
  modes.set(B, "503");
  await assert.rejects(blockNumber(t([A, B])));
  assert.equal(isResting(A) && isResting(B), true);
  modes.clear();
  asked.length = 0;
  assert.equal(await blockNumber(t([A, B])), "0x1");
  assert.deepEqual(asked, ["a:eth_blockNumber"]);
  // retries are passes over the list while only nodes failed
  asked.length = 0;
  resetRpcRest();
  modes.set(A, "503");
  modes.set(B, "503");
  await assert.rejects(blockNumber(t([A, B], { retryCount: 1, retryDelay: 1 })));
  assert.deepEqual(asked, ["a:eth_blockNumber", "b:eth_blockNumber", "a:eth_blockNumber", "b:eth_blockNumber"]);
});

await ok("a log read never goes to an RPC that refuses or caps logs", async () => {
  modes.set(A, "503");
  const tr = t([A, NOLOGS]);
  await assert.rejects(tr.request({ method: "eth_getLogs", params: [{ fromBlock: "0x1", toBlock: "0x2" }] }));
  assert.ok(!asked.some((x) => x.startsWith("nologs:")), asked.join(","));
  // other reads still go there
  assert.equal(await blockNumber(tr), "0x9");
  assert.deepEqual(rpcOrder([NOLOGS], "eth_getLogs"), [0], "a list of only such RPCs still asks one");
});

await ok("an RPC that trails the head (a history RPC) takes no list log read and no send, even with the others resting", async () => {
  const { NO_LOG_RPCS, NO_SEND_RPCS } = await import("../src/lib/networks");
  const head = "https://ethereum-sepolia-rpc.publicnode.com";
  const trailing = "https://sepolia.gateway.tenderly.co";
  assert.ok(NO_LOG_RPCS.has(trailing) && NO_SEND_RPCS.has(trailing));
  restRpc(head);
  assert.deepEqual(rpcOrder([head, trailing], "eth_sendRawTransaction"), [0], "the send waits on the head RPC");
  assert.deepEqual(rpcOrder([head, trailing], "eth_getLogs"), [0], "so does a log read");
  assert.deepEqual(rpcOrder([head, trailing], "eth_blockNumber"), [1], "other reads go down the list");
});

await ok("sendTo one: a send goes to exactly one RPC; one that failed it rests and the next send goes elsewhere", async () => {
  const raw = ("0x" + "02".repeat(50)) as Hex;
  const tr = t([A, B], { retryCount: 3 }, { sendTo: "one" });
  modes.set(A, "drop");
  await assert.rejects(tr.request({ method: "eth_sendRawTransaction", params: [raw] }));
  assert.deepEqual(asked, ["a:eth_sendRawTransaction"], "never handed to a second node, never retried");
  asked.length = 0;
  assert.equal(await tr.request({ method: "eth_sendRawTransaction", params: [raw] }), "0x" + "ab".repeat(32));
  assert.deepEqual(asked, ["b:eth_sendRawTransaction"]);
  // reads of the same transport still go down the list
  asked.length = 0;
  assert.equal(await blockNumber(tr), "0x2");
  // one RPC with sendTo: once, no retry
  resetRpcRest();
  asked.length = 0;
  modes.set(A, "503");
  await assert.rejects(t([A], { retryCount: 3 }, { sendTo: "one" }).request({ method: "eth_sendRawTransaction", params: [raw] }));
  assert.deepEqual(asked, ["a:eth_sendRawTransaction"]);
});

await ok("one RPC and no sendTo is plain http, as before (its own retries)", async () => {
  modes.set(A, "503");
  await assert.rejects(blockNumber(t([A], { retryCount: 2, retryDelay: 1 })));
  assert.deepEqual(asked, ["a:eth_blockNumber", "a:eth_blockNumber", "a:eth_blockNumber"]);
});

await ok("the app's read client and the server transport read down the chain's list", async () => {
  const { baseTestnet, getNetwork } = await import("../src/lib/networks");
  const { publicClientFor } = await import("../src/lib/rhClient");
  const { serverTransport, resetRpcChecks } = await import("../src/lib/serverRpc");
  const [first, second] = baseTestnet.rpcUrls.default.http;
  assert.ok(first && second, "Base Sepolia lists two public RPCs");
  modes.set(first.replace(/\/$/, ""), "503");
  const net = getNetwork("base");
  assert.equal(await publicClientFor(net).getBlockNumber({ cacheTime: 0 }), 9n);
  resetRpcRest();
  resetRpcChecks();
  delete process.env[`GLOAM_RPC_URL_${net.chainId}`];
  const server = createPublicClient({ chain: net.chain, transport: serverTransport(net, { timeout: 300, retryCount: 1 }) });
  assert.equal(await server.getBlockNumber({ cacheTime: 0 }), 9n);
  // a send from the server's relay transport: exactly one public RPC
  asked.length = 0;
  const once = serverTransport(net, { timeout: 300, retryCount: 0 }, { sendOnce: true })({ chain: net.chain });
  assert.equal(await once.request({ method: "eth_sendRawTransaction", params: [("0x" + "02".repeat(50)) as Hex] }), "0x" + "ab".repeat(32));
  assert.deepEqual(asked.filter((x) => x.endsWith("eth_sendRawTransaction")), ["nologs:eth_sendRawTransaction"]);
});

console.log(`rpc list: ${pass} passed`);
