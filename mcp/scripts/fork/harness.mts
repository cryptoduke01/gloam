/**
 * A local anvil fork with a flaky RPC in front of it, for the fork tests.
 *
 * anvil copies the chain's state on demand from `upstream`, and every
 * transaction lands only in the fork. Fresh keys are made for each run and
 * funded inside the fork (anvil_setBalance, or a token sent from an
 * impersonated holder). Nothing is broadcast to a live network.
 *
 * The proxy is what the MCP server talks to. It passes JSON-RPC through to
 * anvil and can fail on purpose the way a public RPC does:
 *
 *   failReceipts  answer eth_getTransactionReceipt with HTTP 429 (a rate limit),
 *                 so a receipt wait throws after the transaction was sent
 *   loseSends     hand eth_sendRawTransaction to anvil, then answer HTTP 504
 *                 as if the gateway timed out: the node has the transaction,
 *                 the sender never hears back
 *
 * It also splits eth_getLogs over forked blocks into the 200-block ranges
 * sepolia.base.org serves, and caches them, so rebuilding the vault's tree
 * takes one slow pass instead of one per tool call.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, encodeFunctionData, http, parseTransaction, toHex, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const ERC20 = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export function findAnvil(): string | null {
  const candidates = [process.env.ANVIL_BIN, join(homedir(), ".foundry", "bin", "anvil")].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(join(dir, "anvil"))) return join(dir, "anvil");
  }
  return null;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => resolve(port));
    });
  });
}

type RpcBody = { jsonrpc: "2.0"; id: number | string; method: string; params?: unknown[] };

export interface Faults {
  /** Answer this many more eth_getTransactionReceipt calls with HTTP 429 (Infinity: until set back to 0). */
  failReceipts: number;
  /** Lose the reply to this many more eth_sendRawTransaction calls (the node still gets them). */
  loseSends: number;
  /** Only lose sends to this address (e.g. the vault, so an approve before it goes through). */
  loseSendsTo?: Address;
}

export interface Fork {
  /** anvil itself, for the test's own setup calls. */
  anvilUrl: string;
  /** The flaky RPC in front of anvil: what the MCP server is pointed at. */
  url: string;
  forkBlock: bigint;
  client: PublicClient;
  faults: Faults;
  /** Raw transactions whose reply the proxy dropped (they reached anvil). */
  lostSends: Hex[];
  rpc<T = unknown>(method: string, params: unknown[]): Promise<T>;
  newKey(eth?: bigint): Promise<{ key: Hex; address: Address }>;
  sendFromHolder(token: Address, holder: Address, to: Address, amount: bigint): Promise<void>;
  setAutomine(on: boolean): Promise<void>;
  mine(): Promise<void>;
  stop(): Promise<void>;
}

/** Start the proxy first (its port goes into the env before the server loads), then point it at anvil. */
export async function startProxy(): Promise<{ url: string; attach(target: { anvilUrl: string; forkBlock: bigint }): void; faults: Faults; lostSends: Hex[]; close(): Promise<void> }> {
  const port = await freePort();
  const faults: Faults = { failReceipts: 0, loseSends: 0 };
  const lostSends: Hex[] = [];
  let target: { anvilUrl: string; forkBlock: bigint } | null = null;
  const logCache = new Map<string, unknown[]>();
  let id = 0;

  const call = async (method: string, params: unknown[]) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(target!.anvilUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      const j = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (!j.error) return j.result;
      // the upstream rate-limits a fast scan: back off and ask again
      if (attempt < 8 && /429|rate|limit|timeout|Transport/i.test(j.error.message)) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        continue;
      }
      throw new Error(`${method}: ${j.error.message}`);
    }
  };

  /** eth_getLogs over forked blocks, 200 blocks a request, cached; local blocks pass straight through. */
  async function getLogs(filter: { address?: string; fromBlock?: string; toBlock?: string; topics?: (string | string[] | null)[] }) {
    const from = BigInt(filter.fromBlock ?? "0x0");
    const latest = BigInt((await call("eth_blockNumber", [])) as string);
    const to = filter.toBlock === undefined || filter.toBlock === "latest" ? latest : BigInt(filter.toBlock);
    const forkTop = target!.forkBlock;
    const pieces: [bigint, bigint][] = [];
    for (let s = from; s <= to && s <= forkTop; s += 200n) {
      let e = s + 199n;
      if (e > to) e = to;
      if (e > forkTop) e = forkTop;
      pieces.push([s, e]);
    }
    const want0 = filter.topics?.[0];
    const matches = (log: { topics: string[] }) =>
      !want0 || (Array.isArray(want0) ? want0.map((t) => t.toLowerCase()).includes(log.topics[0]!.toLowerCase()) : log.topics[0]!.toLowerCase() === want0.toLowerCase());
    const out: unknown[][] = new Array(pieces.length);
    let next = 0;
    const worker = async () => {
      while (next < pieces.length) {
        const i = next++;
        const [s, e] = pieces[i]!;
        const key = `${filter.address?.toLowerCase()}:${s}:${e}`;
        let logs = logCache.get(key);
        if (!logs) {
          logs = (await call("eth_getLogs", [{ address: filter.address, fromBlock: toHex(s), toBlock: toHex(e) }])) as unknown[];
          if (e <= forkTop) logCache.set(key, logs);
        }
        out[i] = logs.filter((l) => matches(l as { topics: string[] }));
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    const local = to > forkTop ? ((await call("eth_getLogs", [{ ...filter, fromBlock: toHex(from > forkTop ? from : forkTop + 1n), toBlock: toHex(to) }])) as unknown[]) : [];
    return [...out.flat(), ...local];
  }

  const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    try {
      const body = JSON.parse(raw) as RpcBody;
      if (body.method === "eth_getTransactionReceipt" && faults.failReceipts > 0) {
        faults.failReceipts--;
        return send(429, { jsonrpc: "2.0", id: body.id, error: { code: 429, message: "Too Many Requests" } });
      }
      if (body.method === "eth_getLogs") {
        return send(200, { jsonrpc: "2.0", id: body.id, result: await getLogs((body.params?.[0] ?? {}) as Parameters<typeof getLogs>[0]) });
      }
      if (body.method === "eth_sendRawTransaction") {
        const rawTx = String(body.params?.[0] ?? "") as Hex;
        // A client's own retry of a send whose reply was lost: the gateway is still timing out.
        if (lostSends.includes(rawTx)) return send(504, "<html><body>504 Gateway Time-out</body></html>");
        const to = parseTransaction(rawTx).to?.toLowerCase();
        if (faults.loseSends > 0 && (!faults.loseSendsTo || to === faults.loseSendsTo.toLowerCase())) {
          faults.loseSends--;
          // The node takes it ...
          await call("eth_sendRawTransaction", [rawTx]);
          lostSends.push(rawTx);
          // ... and the gateway gives up before the answer comes back.
          return send(504, "<html><body>504 Gateway Time-out</body></html>");
        }
      }
      const r = await fetch(target!.anvilUrl, { method: "POST", headers: { "content-type": "application/json" }, body: raw });
      return send(r.status, await r.text());
    } catch (e) {
      return send(200, { jsonrpc: "2.0", id: 0, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
  return {
    url: `http://127.0.0.1:${port}`,
    attach: (t) => void (target = t),
    faults,
    lostSends,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export async function startFork(opts: { upstream: string; chainId: number; proxy: Awaited<ReturnType<typeof startProxy>>; log?: (m: string) => void }): Promise<Fork> {
  const anvil = findAnvil();
  if (!anvil) throw new Error("anvil not found (install Foundry, or set ANVIL_BIN).");
  const port = await freePort();
  const child: ChildProcess = spawn(
    anvil,
    ["--fork-url", opts.upstream, "--port", String(port), "--chain-id", String(opts.chainId), "--silent", "--no-rate-limit"],
    { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" } }
  );
  let stderr = "";
  child.stderr?.on("data", (d) => (stderr += String(d)));
  const anvilUrl = `http://127.0.0.1:${port}`;
  let id = 0;
  const rpc = async <T,>(method: string, params: unknown[]): Promise<T> => {
    const res = await fetch(anvilUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }, (_k, v) => (typeof v === "bigint" ? toHex(v) : v)),
    });
    const j = (await res.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new Error(`${method}: ${j.error.message}`);
    return j.result as T;
  };
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if (Number(await rpc<string>("eth_chainId", [])) === opts.chainId) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`anvil exited: ${stderr.slice(0, 400)}`);
    if (Date.now() > deadline) throw new Error("anvil did not start within 60 seconds.");
    await new Promise((r) => setTimeout(r, 300));
  }
  const forkBlock = BigInt(await rpc<string>("eth_blockNumber", []));
  await rpc("anvil_mine", ["0x1"]);
  opts.proxy.attach({ anvilUrl, forkBlock });
  opts.log?.(`fork of ${opts.upstream} at block ${forkBlock} on ${anvilUrl}, flaky RPC on ${opts.proxy.url}`);
  const client = createPublicClient({ transport: http(anvilUrl) }) as PublicClient;

  const sendAs = async (from: Address, to: Address, data: Hex) => {
    await rpc("anvil_impersonateAccount", [from]);
    try {
      const gas = await rpc<Hex>("eth_estimateGas", [{ from, to, data }]);
      const hash = await rpc<Hex>("eth_sendTransaction", [{ from, to, data, gas: toHex((BigInt(gas) * 12n) / 10n) }]);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`call from ${from} reverted (${hash})`);
    } finally {
      await rpc("anvil_stopImpersonatingAccount", [from]);
    }
  };

  return {
    anvilUrl,
    url: opts.proxy.url,
    forkBlock,
    client,
    faults: opts.proxy.faults,
    lostSends: opts.proxy.lostSends,
    rpc,
    async newKey(eth = 10n ** 18n) {
      const key = generatePrivateKey();
      const address = privateKeyToAccount(key).address;
      await rpc("anvil_setBalance", [address, toHex(eth)]);
      return { key, address };
    },
    async sendFromHolder(token, holder, to, amount) {
      await rpc("anvil_setBalance", [holder, toHex(10n ** 19n)]);
      await sendAs(holder, token, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [to, amount] }));
    },
    async setAutomine(on) {
      await rpc("evm_setAutomine", [on]);
    },
    async mine() {
      await rpc("evm_mine", []);
    },
    async stop() {
      await opts.proxy.close();
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 200));
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    },
  };
}
