/**
 * Wallet sends: which transaction a send that threw belongs to, and whether it
 * may have gone out.
 *
 *   pnpm --filter @gloamtrade/mcp test
 *
 * The signer's transport notes each signed transaction's hash before the RPC
 * answers and passes viem's own request options through (viem sends a
 * transaction once). Each wallet send collects only its own hashes, even with
 * others in flight. A throw counts as refused only on a node refusal the node
 * then does not keep, checked again a block later; everything else may have
 * landed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { HttpRequestError, TransactionNotFoundError, createWalletClient, keccak256, type Hex } from "viem";
import { broadcastNotingTransport, type Signer } from "../src/signer.js";
import { WalletSendUnclear, mayHaveIt, noteBroadcast, sendRefusal, walletSend } from "../src/walletSend.js";

const RAW =
  "0x02f86b0180843b9aca00843b9aca0082520894000000000000000000000000000000000000000080808080a0aaaa0000000000000000000000000000000000000000000000000000000000a0bbbb0000000000000000000000000000000000000000000000000000000000" as Hex;

test("the transport sends a transaction once, as viem asks, and notes its hash for the send it belongs to", async () => {
  let hits = 0;
  const srv = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw) as { id: number; method: string };
    if (body.method === "eth_sendRawTransaction") {
      hits++;
      res.writeHead(504);
      return res.end("<html>504 Gateway Time-out</html>");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: "0x1" }));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  try {
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const wallet = createWalletClient({ transport: broadcastNotingTransport(url) });
    const signer = { walletClient: wallet, publicClient: {} } as unknown as Signer;
    const err = await walletSend(signer, (w) => w.sendRawTransaction({ serializedTransaction: RAW })).catch((e: unknown) => e);
    assert.equal(hits, 1, "viem's retryCount 0 for a send reaches the RPC: one send, never resent");
    assert.ok(err instanceof WalletSendUnclear, String(err));
    assert.equal(err.hash, keccak256(RAW), "the send's own hash, noted before the RPC answered");
  } finally {
    srv.close();
  }
});

/** A fake wallet whose writeContract notes `hash` (as the transport would) after `wait`, then answers with `outcome`. */
function fakeSigner(publicClient: Record<string, unknown> = {}) {
  return (writeContract: () => Promise<Hex>) =>
    ({ walletClient: { writeContract }, publicClient }) as unknown as Signer;
}

test("two sends at once each keep their own hash; one that failed before it was sent has none", async () => {
  let releaseB!: () => void;
  const bSent = new Promise<void>((r) => (releaseB = r));
  const make = fakeSigner();
  const a = walletSend(
    make(async () => {
      await bSent; // B broadcasts while A is still estimating gas
      throw new HttpRequestError({ url: "https://rpc.example", status: 503, body: { method: "eth_estimateGas" } });
    }),
    (w) => w.writeContract({} as never)
  ).catch((e: unknown) => e);
  const b = walletSend(
    make(async () => {
      noteBroadcast(`0x${"bb".repeat(32)}`);
      releaseB();
      throw new HttpRequestError({ url: "https://rpc.example", status: 504, body: { method: "eth_sendRawTransaction" } });
    }),
    (w) => w.writeContract({} as never)
  ).catch((e: unknown) => e);
  const [ea, eb] = await Promise.all([a, b]);
  assert.ok(!(ea instanceof WalletSendUnclear), "A never sent anything: a plain error, nothing to wait for");
  assert.ok(eb instanceof WalletSendUnclear);
  assert.equal(eb.hash, `0x${"bb".repeat(32)}`);
});

test("only a node's refusal, still absent a block later, counts as not sent", async () => {
  const coded = (message: string, code = -32000) => Object.assign(new Error(message), { code });
  const refused = [
    "insufficient funds for gas * price + value",
    "intrinsic gas too low",
    "transaction underpriced",
    "max fee per gas less than block base fee",
    "invalid sender",
    "invalid chain id for signer",
    "exceeds block gas limit",
    "oversized data",
  ];
  for (const m of refused) assert.equal(sendRefusal(coded(m)), "refused", m);
  const unclear: unknown[] = [
    coded("replacement transaction underpriced"),
    coded("already known"),
    coded("nonce too low"),
    coded("request timed out", -32002),
    coded("upstream connect error or disconnect/reset before headers"),
    coded("context deadline exceeded"),
    coded("bad gateway"),
    coded("something the node has not said before"),
    new HttpRequestError({ url: "https://rpc.example", status: 504 }),
    new TypeError("fetch failed"),
    // a refusal wrapped around a timeout is still a timeout
    Object.assign(new Error("insufficient funds"), { cause: coded("request timed out", -32002) }),
  ];
  for (const e of unclear) assert.equal(sendRefusal(e), "unclear", String((e as Error).message));

  const hash = `0x${"cc".repeat(32)}` as Hex;
  let block = 7n;
  let asked: bigint | null = null;
  let has = false;
  const client = {
    getBlockNumber: async () => block++,
    getTransaction: async () => {
      asked = block;
      if (has) return { hash };
      throw new TransactionNotFoundError({ hash });
    },
  } as unknown as Signer["publicClient"];
  assert.equal(await mayHaveIt(client, hash, { blockMs: 1000, pollMs: 1 }), false, "not there a block later");
  assert.ok(asked !== null && asked > 8n, "asked only once a new block was out");
  has = true;
  assert.equal(await mayHaveIt(client, hash, { blockMs: 1000, pollMs: 1 }), true, "there a block later: it was sent");
  const stalled = { getBlockNumber: async () => 7n, getTransaction: async () => { throw new TransactionNotFoundError({ hash }); } } as unknown as Signer["publicClient"];
  assert.equal(await mayHaveIt(stalled, hash, { blockMs: 20, pollMs: 1 }), true, "no new block to judge by: it may have been sent");

  // walletSend with a refusal: a plain error when the node does not have it a block later
  const sendRefused = (publicClient: Record<string, unknown>) =>
    walletSend(
      fakeSigner(publicClient)(async () => {
        noteBroadcast(hash);
        throw coded("insufficient funds for gas * price + value");
      }),
      (w) => w.writeContract({} as never)
    ).catch((e: unknown) => e);
  let b2 = 1n;
  const gone = await sendRefused({ getBlockNumber: async () => b2++, getTransaction: async () => { throw new TransactionNotFoundError({ hash }); } });
  assert.ok(!(gone instanceof WalletSendUnclear), "refused and not kept: not sent");
  let b3 = 1n;
  const kept = await sendRefused({ getBlockNumber: async () => b3++, getTransaction: async () => ({ hash }) });
  assert.ok(kept instanceof WalletSendUnclear, "refused, yet the node has it a block later: it was sent");
});
