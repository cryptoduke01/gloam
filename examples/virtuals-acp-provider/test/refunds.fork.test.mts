/**
 * Refunds pinned before they are sent, read back from a Base Sepolia fork:
 *
 *   - a smart account's user operation run by the real ERC-4337 EntryPoint
 *     v0.7 (a test account placed with anvil_setCode; an anvil key bundles
 *     with handleOps): held while it has not run, counted once it ran, sent
 *     again only when it ran and reverted;
 *   - an EOA refund dropped from the pool, whose nonce the owner's own refund
 *     then used.
 *
 * Each case starts from a job that ended with 7 USDC owed back (written to
 * the journal), so only refund rounds run. Fresh keys funded inside the fork only.
 *
 *   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter gloam-virtuals-acp-provider-example test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, encodeFunctionData, http, parseUnits, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { entryPoint07Abi, entryPoint07Address, toPackedUserOperation } from "viem/account-abstraction";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";
import { BASE_SEPOLIA_USDC } from "@gloamtrade/sdk";
import { ERC20, findAnvil, startFork, type Fork } from "../../../packages/game-plugin-gloam/test/fork/harness.mts";
import { ENTRYPOINT_V07, assetToken } from "../src/acp.ts";
import { PrivatePayoutProvider, type RefundContext } from "../src/provider.ts";

const upstream = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const SKIP = !upstream ? "set BASE_SEPOLIA_RPC_URL" : !findAnvil() ? "anvil not found" : false;
const HOLDER = "0xfaec9cdc3ef75713b48f46057b98ba04885e3391" as Address;
const RUNTIME = `0x${readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fork", "TestAccount07.runtime.hex"), "utf8").trim()}` as Hex;
const ACCOUNT_ABI = [
  { type: "function", name: "execute", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [] },
] as const;
const usdc = (v: string) => parseUnits(v, 6);
const SEVEN = usdc("7");
const LOST = "Timed out while waiting for call bundle to be confirmed.";

/** A provider whose only job ended with 7 USDC owed back to `client`; `from` is the provider's address. */
async function ended(fork: Fork, from: Address, client: Address, jobId: string, refund: (to: Address, token: Address, raw: bigint, ctx: RefundContext) => Promise<string>) {
  const journalPath = join(mkdtempSync(join(tmpdir(), "gloam-refund-fork-")), "jobs.json");
  const block = await fork.client.getBlockNumber();
  writeFileSync(
    journalPath,
    JSON.stringify({
      [`84532:${jobId}`]: {
        chainId: 84532, jobId, client, mode: "fund-transfer", state: "rejected", budgetRaw: "100000", transferRaw: SEVEN.toString(),
        funded: true, receivedRaw: SEVEN.toString(), quotedAtBlock: block.toString(), payouts: [{ to: "gloamr1.payee", amount: "7" }],
        replyTo: null, results: [], refundedRaw: "0", refundTxs: [], updatedAt: new Date().toISOString(),
      },
    })
  );
  // Refund rounds read the asset and the provider's address from the engine, and the chain from `chain`.
  const wallet = { network: { key: "base", chainId: 84532, label: "Base", testnet: true, assets: [{ symbol: "USDC", address: BASE_SEPOLIA_USDC, decimals: 6 }] }, walletAddress: from } as unknown as GloamAgent;
  return new PrivatePayoutProvider({
    wallet,
    chain: fork.client,
    budgetToken: (raw) => assetToken(BASE_SEPOLIA_USDC, "USDC", 6, raw),
    acpFeeBps: () => 0,
    journalPath,
    refund,
    log: (m) => console.log(`  [provider] ${m}`),
  });
}

const balanceOf = (fork: Fork, who: Address) => fork.client.readContract({ address: BASE_SEPOLIA_USDC, abi: ERC20, functionName: "balanceOf", args: [who] }) as Promise<bigint>;

test("refunds pinned to a user operation (real EntryPoint v0.7) and to an EOA nonce settle from the chain, never twice", { skip: SKIP, timeout: 10 * 60_000 }, async () => {
  const fork = await startFork({ upstream: upstream!, chainId: 84532, log: (m) => console.log(`  ${m}`) });
  const chain = { id: 84532, name: "fork", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [fork.url] } } } as const;
  try {
    assert.ok((await fork.client.getCode({ address: entryPoint07Address }))?.length, "EntryPoint v0.7 is on Base Sepolia");
    assert.equal(entryPoint07Address.toLowerCase(), ENTRYPOINT_V07.toLowerCase());
    const bundler = await fork.newKey();
    const bw = createWalletClient({ account: privateKeyToAccount(bundler.key), chain, transport: http(fork.url) });

    // The provider's smart account.
    const account = privateKeyToAccount(generatePrivateKey()).address;
    await fork.rpc("anvil_setCode", [account, RUNTIME]);
    await fork.rpc("anvil_setBalance", [account, toHex(10n ** 18n)]);
    await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, account, usdc("30"));
    let keys = 0n;
    /** A signed user operation moving `amount` to `to`, with a nonce key of its own. */
    const userOp = async (to: Address, amount: bigint) => {
      const key = 0xacc0000n + ++keys;
      const nonce = (await fork.client.readContract({ address: entryPoint07Address, abi: entryPoint07Abi, functionName: "getNonce", args: [account, key] })) as bigint;
      const transfer = encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [to, amount] });
      const op = toPackedUserOperation({
        sender: account, nonce, callData: encodeFunctionData({ abi: ACCOUNT_ABI, functionName: "execute", args: [BASE_SEPOLIA_USDC, 0n, transfer] }),
        callGasLimit: 200_000n, verificationGasLimit: 200_000n, preVerificationGas: 60_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, signature: "0x",
      });
      return { op, nonce };
    };
    const bundle = async (op: Awaited<ReturnType<typeof userOp>>["op"]) => {
      const hash = await bw.writeContract({ address: entryPoint07Address, abi: entryPoint07Abi, functionName: "handleOps", args: [[op], bundler.address], chain, account: bw.account });
      const r = await fork.client.waitForTransactionReceipt({ hash });
      assert.equal(r.status, "success", "the bundle transaction itself succeeds");
      return hash;
    };

    // 1. The answer is lost; the operation runs only later.
    {
      const client = privateKeyToAccount(generatePrivateKey()).address;
      let calls = 0;
      let held: Awaited<ReturnType<typeof userOp>>["op"] | undefined;
      const p = await ended(fork, account, client, "1", async (to, _t, raw, ctx) => {
        calls++;
        const { op, nonce } = await userOp(to, raw);
        ctx.sending({ userOp: { entryPoint: entryPoint07Address, sender: account, nonce } });
        held = op; // handed to a bundler; the answer never comes back
        throw new Error(LOST);
      });
      await p.retryRefunds();
      await p.retryRefunds();
      assert.equal(calls, 1, "held while it has not run: not sent again");
      assert.equal(p.status(84532, "1")!.refundOwed, "7");
      await assert.rejects(p.resolveRefund(84532, "1", { notSent: true }), /has not run yet/);
      const ran = await bundle(held!);
      await p.retryRefunds();
      const j = p.status(84532, "1")!;
      console.log(`  case 1: ran in ${ran}; owed ${j.refundOwed}; counted ${JSON.stringify(j.refundTxs)}; calls ${calls}`);
      assert.equal(j.refundOwed, "0");
      assert.deepEqual(j.refundTxs, [ran]);
      assert.equal(calls, 1);
      assert.equal(await balanceOf(fork, client), SEVEN);
    }

    // 2. The operation ran and reverted (it asked for more than the account holds): sent again, once.
    {
      const client = privateKeyToAccount(generatePrivateKey()).address;
      let calls = 0;
      const p = await ended(fork, account, client, "2", async (to, _t, raw, ctx) => {
        calls++;
        const { op, nonce } = await userOp(to, calls === 1 ? usdc("1000000") : raw);
        ctx.sending({ userOp: { entryPoint: entryPoint07Address, sender: account, nonce } });
        const hash = await bundle(op);
        if (calls === 1) throw new Error(LOST);
        return hash;
      });
      await p.retryRefunds();
      assert.equal(p.status(84532, "2")!.refundOwed, "7");
      await p.retryRefunds();
      const j = p.status(84532, "2")!;
      console.log(`  case 2: owed ${j.refundOwed}; counted ${JSON.stringify(j.refundTxs)}; calls ${calls}`);
      assert.equal(calls, 2);
      assert.equal(j.refundOwed, "0");
      assert.equal(await balanceOf(fork, client), SEVEN);
    }

    // 3. An EOA refund dropped from the pool; the owner sends the refund by hand with the same nonce.
    {
      const client = privateKeyToAccount(generatePrivateKey()).address;
      const eoa = await fork.newKey();
      await fork.sendFromHolder(BASE_SEPOLIA_USDC, HOLDER, eoa.address, usdc("30"));
      const ew = createWalletClient({ account: privateKeyToAccount(eoa.key), chain, transport: http(fork.url) });
      const transfer = (raw: bigint) => encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [client, raw] });
      let calls = 0;
      let sentNonce = -1;
      const p = await ended(fork, eoa.address, client, "3", async (_to, token, raw) => {
        calls++;
        sentNonce = await fork.client.getTransactionCount({ address: eoa.address, blockTag: "pending" });
        return ew.sendTransaction({ to: token, data: transfer(raw), chain, account: ew.account, gas: 100_000n });
      });
      await fork.rpc("evm_setAutomine", [false]);
      let manual: Hex;
      try {
        await p.retryRefunds(); // broadcast, not mined
        const first = p.status(84532, "3")!.refundPending!;
        assert.equal(first.pin?.kind, "eoa", "the nonce of the provider's own transaction is read back at once");
        await fork.rpc("anvil_dropTransaction", [first.tx]);
        // A different transaction with the same nonce (another gas limit), as a wallet's own send would be.
        manual = await ew.sendTransaction({ to: BASE_SEPOLIA_USDC, data: transfer(SEVEN), chain, account: ew.account, nonce: sentNonce, gas: 120_000n });
        assert.notEqual(manual, first.tx);
        await fork.rpc("evm_mine", []);
      } finally {
        await fork.rpc("evm_setAutomine", [true]);
      }
      await p.retryRefunds();
      const held = p.refundsNeedingOwner().find((r) => r.jobId === "3");
      assert.match(held?.why ?? "", /can no longer land/);
      await assert.rejects(p.resolveRefund(84532, "3", { notSent: true }), new RegExp(manual!));
      const j = await p.resolveRefund(84532, "3", { tx: manual! });
      console.log(`  case 3: dropped nonce ${sentNonce}; owner's refund ${manual!}; owed ${j.refundOwed}; calls ${calls}`);
      assert.equal(j.refundOwed, "0");
      assert.equal(calls, 1);
      assert.equal(await balanceOf(fork, client), SEVEN);
    }
  } finally {
    await fork.stop();
  }
});
