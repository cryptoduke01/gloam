/**
 * Add privately on Ethereum Sepolia, timed end to end on a local anvil fork,
 * before and after the read split (lib/readTransport). Nothing is broadcast
 * and no key is used: anvil forks Sepolia, mines a block every 12 s like the
 * chain, and sends as the vault owner through impersonation (standing in for
 * the wallet, which sends through its own RPC).
 *
 * The app's reads go through one of two local proxies in front of anvil:
 *  - "lagging" answers as of SIM_LAG_BLOCKS blocks ago (default 6, the 4 to 9
 *    measured on Tenderly's gateway on 2026-10-25): its head, receipts, mined
 *    transactions and state at "latest" are that far back, and it never sees a
 *    pending transaction;
 *  - "fresh" passes everything straight through.
 * Both count the calls they serve.
 *
 * before: the client Sepolia had (wagmi-style, http to the lagging RPC, viem's
 *   4 s block polling), the allowance read from it, the deposit proof made
 *   after the approval lands.
 * after: lib/readTransport (fresh RPC for the head, lagging one only for old
 *   blocks), BLOCK_POLL_MS, approvalsBeforeDeposit on an allowance read at the
 *   click, and the proof made while the approval is mined.
 * The receipt waits are wagmi's own waitForTransactionReceipt action, the code
 * under useWaitForTransactionReceipt. The proof is a real Groth16 shield proof
 * on the ceremony's final keys, checked by the vault's real verifier.
 *
 * Run from app/ (anvil on PATH):
 *   ../mcp/node_modules/.bin/tsx scripts/sim-sepolia-deposit.mts
 * SIM_MODE=before|after|both (default both), SIM_LAG_BLOCKS, SIM_FORK_URL,
 * SIM_POLL_MS (after: block polling instead of BLOCK_POLL_MS).
 */
import "./browser-shim.mts";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import { createConfig, http as wagmiHttp } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { decodeEventLog, encodeFunctionData, toHex, type Address, type Hex } from "viem";
import { makeBoundNotePoseidon, packGroth16Proof, type Groth16Proof } from "@gloamtrade/sdk";

const { getNetwork, ethereumTestnet } = await import("../src/lib/networks");
const { readTransport, BLOCK_POLL_MS } = await import("../src/lib/readTransport");
const { approvalsBeforeDeposit, shieldTokensFor } = await import("../src/lib/tokens");
const { shieldPoolAbi } = await import("../src/lib/shield");
const { erc20Abi } = await import("../src/lib/dex");

const MODE = process.env.SIM_MODE ?? "both";
const LAG = BigInt(process.env.SIM_LAG_BLOCKS ?? "6");
const FORK_URL = process.env.SIM_FORK_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const OWNER: Address = "0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8";
const AMOUNT = 20_000_000n; // 20 USDC, the deposit Duke made
const net = getNetwork("ethereum");
const usdc = shieldTokensFor(11155111).find((t) => t.symbol === "USDC")!;
const pool = net.pool!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// ------------------------------------------------------------------ anvil

const anvilPort = 20_000 + Math.floor(Math.random() * 20_000);
const anvilUrl = `http://127.0.0.1:${anvilPort}`;
const anvil = spawn("anvil", ["--fork-url", FORK_URL, "--block-time", "12", "--port", String(anvilPort), "--silent", "--no-rate-limit"], {
  stdio: "ignore",
});
process.on("exit", () => anvil.kill());

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC answers, read by shape where used
async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

for (let i = 0; ; i++) {
  try {
    await rpc(anvilUrl, "eth_chainId");
    break;
  } catch {
    if (i > 120) throw new Error("anvil did not start");
    await sleep(500);
  }
}
const forkBlock = BigInt(await rpc(anvilUrl, "eth_blockNumber"));
await rpc(anvilUrl, "anvil_impersonateAccount", [OWNER]);

// ------------------------------------------------------------------ proxies

type Counter = { calls: number; byMethod: Record<string, number> };

/** A JSON-RPC proxy in front of anvil that answers as of `lag` blocks ago (0: as is). */
async function proxy(lag: bigint): Promise<{ url: string; count: Counter; server: Server }> {
  const count: Counter = { calls: 0, byMethod: {} };
  const one = async (req: { id: unknown; method: string; params?: unknown[] }) => {
    count.calls++;
    count.byMethod[req.method] = (count.byMethod[req.method] ?? 0) + 1;
    const p = [...(req.params ?? [])];
    const head = BigInt(await rpc(anvilUrl, "eth_blockNumber"));
    const seen = head - lag;
    const tag = (t: unknown) => (t === undefined || t === "latest" || t === "pending" ? toHex(seen) : t);
    const over = (t: unknown) => typeof t === "string" && t.startsWith("0x") && BigInt(t) > seen;
    let result: unknown;
    try {
      if (lag === 0n) result = await rpc(anvilUrl, req.method, p);
      else if (req.method === "eth_blockNumber") result = toHex(seen);
      else if (req.method === "eth_getTransactionReceipt" || req.method === "eth_getTransactionByHash") {
        const r = (await rpc(anvilUrl, req.method, p)) as { blockNumber?: string | null } | null;
        result = !r || !r.blockNumber || BigInt(r.blockNumber) > seen ? null : r;
      } else if (req.method === "eth_getBlockByNumber") {
        result = over(p[0]) ? null : await rpc(anvilUrl, req.method, [tag(p[0]), p[1]]);
      } else if (["eth_call", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_estimateGas"].includes(req.method)) {
        if (over(p[1])) throw new Error("header not found");
        p[1] = tag(p[1]);
        result = await rpc(anvilUrl, req.method, p);
      } else if (req.method === "eth_getLogs") {
        const f = { ...(p[0] as Record<string, unknown>) };
        if (f.toBlock === undefined || f.toBlock === "latest" || over(f.toBlock)) f.toBlock = toHex(seen);
        result = await rpc(anvilUrl, req.method, [f]);
      } else result = await rpc(anvilUrl, req.method, p);
      return { jsonrpc: "2.0", id: req.id, result };
    } catch (e) {
      return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: (e as Error).message } };
    }
  };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const parsed = JSON.parse(body);
      const out = Array.isArray(parsed) ? await Promise.all(parsed.map(one)) : await one(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, count, server };
}

// ------------------------------------------------------------------ the wallet and the chain

/**
 * The wallet: sends as the owner straight to anvil, as a wallet sends through
 * its own RPC. Its time (anvil estimating gas, fetching the fork's state the
 * first time) is the wallet's, not the app's, and is left out of the totals.
 */
let walletMs = 0;
async function walletSend(to: Address, data: Hex): Promise<Hex> {
  const t = now();
  try {
    return await rpc(anvilUrl, "eth_sendTransaction", [{ from: OWNER, to, data }]);
  } finally {
    walletMs += now() - t;
  }
}

/** When anvil mined a transaction, read straight from anvil every 100 ms (not counted). */
async function minedAt(hash: Hex): Promise<{ at: number; block: bigint; gasUsed: bigint; status: string }> {
  for (;;) {
    const r = (await rpc(anvilUrl, "eth_getTransactionReceipt", [hash])) as { blockNumber: string; gasUsed: string; status: string } | null;
    if (r) return { at: now(), block: BigInt(r.blockNumber), gasUsed: BigInt(r.gasUsed), status: r.status };
    await sleep(100);
  }
}

/** A real shield proof on the final keys: commitment == Poseidon(secret, amount, asset). */
async function proveShield(): Promise<{ commitment: Hex; proofBytes: Hex; ms: number }> {
  const t = now();
  const note = await makeBoundNotePoseidon(AMOUNT, usdc.address);
  const wasm = fileURLToPath(new URL("../public/circuits/shield.wasm", import.meta.url));
  const zkey = fileURLToPath(new URL("../public/circuits/final/shield_final.zkey", import.meta.url));
  const { proof } = await snarkjs.groth16.fullProve(
    { commitment: BigInt(note.commitment).toString(), amount: AMOUNT.toString(), asset: BigInt(usdc.address).toString(), secret: BigInt(note.secret).toString() },
    wasm,
    zkey
  );
  return { commitment: note.commitment, proofBytes: packGroth16Proof(proof as Groth16Proof), ms: now() - t };
}

// ------------------------------------------------------------------ one run

type Run = { label: string; lines: string[]; totalMs: number };

async function run(mode: "before" | "after", lagging: string, fresh: string): Promise<Run> {
  // a fresh state each run: the owner's allowance back to 0, wait for the next block
  await walletSend(usdc.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pool, 0n] })).then(minedAt);
  // let the lagging RPC catch up, so both runs start from the same view
  await sleep(Number(LAG + 1n) * 12_000);

  const chain = { ...ethereumTestnet, rpcUrls: { default: { http: [mode === "before" ? lagging : fresh] } } };
  const transport =
    mode === "before"
      ? wagmiHttp(lagging, { batch: { wait: 16 } })
      : readTransport({ chain, historyRpc: { url: lagging, recentBlocks: 9_000n } }, { batch: { wait: 16 } });
  const config = createConfig({
    chains: [chain],
    transports: { [chain.id]: transport },
    ...(mode === "after" ? { pollingInterval: process.env.SIM_POLL_MS ? Number(process.env.SIM_POLL_MS) : BLOCK_POLL_MS } : {}),
  });
  const lines: string[] = [];
  walletMs = 0;
  const t0 = now();

  // the click: the allowance as the client reads it
  const allowance = await readContract(config, { address: usdc.address, abi: erc20Abi, functionName: "allowance", args: [OWNER, pool], chainId: chain.id });
  const tRead = now();
  lines.push(`allowance read: ${allowance} in ${s(tRead - t0)}`);
  // before: an allowance not read yet counted as none; after: approvalsBeforeDeposit
  const steps = mode === "before" ? (allowance >= AMOUNT ? [] : [AMOUNT]) : approvalsBeforeDeposit(usdc, allowance, AMOUNT)!;
  lines.push(`approvals: [${steps.join(", ")}]`);

  // after: the proof is made while the approval is mined
  const early = mode === "after" ? proveShield() : null;

  let approveSeenAfterMined = 0;
  const reloads: Promise<string>[] = [];
  for (const v of steps) {
    const h = await walletSend(usdc.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pool, v] }));
    const sent = now();
    // what a reload would read 5 s after the approval is mined (on the side, not waited on)
    reloads.push(
      minedAt(h)
        .then(() => sleep(5_000))
        .then(() => readContract(config, { address: usdc.address, abi: erc20Abi, functionName: "allowance", args: [OWNER, pool], chainId: chain.id }))
        .then((a) => `allowance a reload reads 5 s after the approval is mined: ${a}${a < AMOUNT ? " (it would ask for a second approval)" : ""}`)
    );
    const [mined, seen] = await Promise.all([minedAt(h), waitForTransactionReceipt(config, { hash: h, chainId: chain.id }).then(() => now())]);
    approveSeenAfterMined = seen - mined.at;
    lines.push(`approve ${v}: mined ${s(mined.at - sent)} after sending (block ${mined.block}), seen by the app ${s(seen - mined.at)} after it was mined`);
  }

  const tProof = now();
  const proof = early ? await early : await proveShield();
  lines.push(
    early
      ? `proof: ${s(proof.ms)}, made while the approval was mined (waited ${s(now() - tProof)} for it after)`
      : `proof: ${s(proof.ms)}, made after the approval landed`
  );

  const h = await walletSend(pool, encodeFunctionData({ abi: shieldPoolAbi, functionName: "shieldBound", args: [usdc.address, AMOUNT, proof.commitment, proof.proofBytes] }));
  const sent = now();
  const [mined, receipt] = await Promise.all([minedAt(h), waitForTransactionReceipt(config, { hash: h, chainId: chain.id }).then((r) => ({ r, at: now() }))]);
  let leaf: bigint | undefined;
  for (const log of receipt.r.logs) {
    try {
      const d = decodeEventLog({ abi: shieldPoolAbi, data: log.data, topics: log.topics });
      if (d.eventName === "Shielded") leaf = (d.args as { leafIndex: bigint }).leafIndex;
    } catch {
      /* not the vault's */
    }
  }
  if (mined.status !== "0x1" || leaf === undefined) throw new Error(`deposit did not go through (${mined.status})`);
  lines.push(`deposit: mined ${s(mined.at - sent)} after sending (block ${mined.block}, leaf ${leaf}), seen by the app ${s(receipt.at - mined.at)} after it was mined`);
  lines.push(...(await Promise.all(reloads)));
  const totalMs = receipt.at - t0 - walletMs;
  lines.push(
    `click to "Added privately": ${s(totalMs)} without the wallet's own ${s(walletMs)} (approval seen ${s(approveSeenAfterMined)} late, deposit seen ${s(receipt.at - mined.at)} late)`
  );
  return { label: mode, lines, totalMs };
}

// ------------------------------------------------------------------ main

const lagging = await proxy(LAG);
const fresh = await proxy(0n);
console.log(`anvil fork of Sepolia at block ${forkBlock}, 12 s blocks; lagging RPC ${LAG} blocks behind; vault ${pool}`);
const runs: Run[] = [];
for (const mode of MODE === "both" ? (["before", "after"] as const) : [MODE as "before" | "after"]) {
  const before = { lag: lagging.count.calls, fresh: fresh.count.calls };
  const r = await run(mode, lagging.url, fresh.url);
  console.log(`\n${mode}:`);
  for (const l of r.lines) console.log(`  ${l}`);
  console.log(`  RPC calls: lagging ${lagging.count.calls - before.lag}, fresh ${fresh.count.calls - before.fresh}`);
  runs.push(r);
}
if (runs.length === 2) console.log(`\nbefore ${s(runs[0]!.totalMs)}, after ${s(runs[1]!.totalMs)}`);
lagging.server.close();
fresh.server.close();
anvil.kill();
process.exit(0);
