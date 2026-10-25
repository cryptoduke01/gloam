/**
 * A local anvil fork for end-to-end runs: no real keys, no faucets, nothing
 * broadcast anywhere. anvil copies the chain's state on demand from `upstream`
 * and every transaction here lands only in the fork.
 *
 * Fresh keys are made for each run and funded inside the fork: native ETH with
 * anvil_setBalance, tokens by impersonating a holder and sending from it (or,
 * for a test token with a plain balance mapping, by writing the balance).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  pad,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const ERC20 = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export function findAnvil(): string | null {
  const candidates = [process.env.ANVIL_BIN, join(homedir(), ".foundry", "bin", "anvil")].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(join(dir, "anvil"))) return join(dir, "anvil");
  }
  return null;
}

async function freePort(): Promise<number> {
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

export interface Fork {
  url: string;
  chainId: number;
  client: PublicClient;
  rpc<T = unknown>(method: string, params: unknown[]): Promise<T>;
  /** A fresh key with `eth` ether on the fork. */
  newKey(eth?: bigint): Promise<{ key: Hex; address: Address }>;
  /** Move `amount` of `token` from `holder` (impersonated) to `to`. */
  sendFromHolder(token: Address, holder: Address, to: Address, amount: bigint): Promise<Hex>;
  /** Write a token balance straight into a plain `mapping(address => uint256)` at `slot`. */
  setTokenBalance(token: Address, slot: number, who: Address, amount: bigint): Promise<void>;
  /** Send a call from an impersonated address. */
  sendAs(from: Address, to: Address, data: Hex, value?: bigint): Promise<Hex>;
  stop(): Promise<void>;
}

export async function startFork(opts: { upstream: string; chainId: number; log?: (m: string) => void }): Promise<Fork> {
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
  const url = `http://127.0.0.1:${port}`;
  let id = 0;
  const rpc = async <T,>(method: string, params: unknown[]): Promise<T> => {
    const res = await fetch(url, {
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
      const got = await rpc<string>("eth_chainId", []);
      if (Number(got) === opts.chainId) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`anvil exited: ${stderr.slice(0, 400)}`);
    if (Date.now() > deadline) throw new Error("anvil did not start within 60 seconds.");
    await new Promise((r) => setTimeout(r, 300));
  }
  opts.log?.(`fork of ${opts.upstream} on ${url}`);
  const client = createPublicClient({ transport: http(url) }) as PublicClient;

  const sendAs = async (from: Address, to: Address, data: Hex, value = 0n): Promise<Hex> => {
    await rpc("anvil_impersonateAccount", [from]);
    try {
      // Name the gas: on Arbitrum-style chains anvil would otherwise reserve the whole block's gas limit.
      const gas = await rpc<Hex>("eth_estimateGas", [{ from, to, data, value: toHex(value) }]);
      const hash = await rpc<Hex>("eth_sendTransaction", [{ from, to, data, value: toHex(value), gas: toHex((BigInt(gas) * 12n) / 10n) }]);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`call from ${from} reverted (${hash})`);
      return hash;
    } finally {
      await rpc("anvil_stopImpersonatingAccount", [from]);
    }
  };

  return {
    url,
    chainId: opts.chainId,
    client,
    rpc,
    async newKey(eth = 10n ** 19n) {
      const key = generatePrivateKey();
      const address = privateKeyToAccount(key).address;
      await rpc("anvil_setBalance", [address, toHex(eth)]);
      return { key, address };
    },
    async sendFromHolder(token, holder, to, amount) {
      await rpc("anvil_setBalance", [holder, toHex(10n ** 19n)]);
      return sendAs(holder, token, encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [to, amount] }));
    },
    async setTokenBalance(token, slot, who, amount) {
      const key = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, BigInt(slot)]));
      await rpc("anvil_setStorageAt", [token, key, pad(toHex(amount), { size: 32 })]);
    },
    sendAs,
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 200));
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    },
  };
}
