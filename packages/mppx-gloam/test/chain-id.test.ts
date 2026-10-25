/**
 * A server only settles a charge on the chain the charge names. Base Sepolia
 * and Base mainnet (and Ethereum after them) run the Gloam vault at one
 * address and both list native ETH at 0x0, so nothing in a payment tells them
 * apart: a server pricing base-mainnet whose chain reader still points at Base
 * Sepolia took a Base Sepolia (testnet) ETH payment, swept it on Base Sepolia
 * and answered 200 for a mainnet charge. Now the reader's own chain id must be
 * the charge's, checked before anything is read or swept.
 */
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
// The pools module alone, before the SDK builds its networks from it.
import { BASE_SEPOLIA_POOL, MAINNET_POOLS } from "../../sdk/src/mainnet.ts";

// Base mainnet's pool goes in at the shared address, as it will on deploy day.
const SHARED = "0x39e28cde55cab798874746ac52cb4b5cc99a0194" as const;
MAINNET_POOLS[8453] = { pool: SHARED, deployBlock: 1n };
assert.equal(BASE_SEPOLIA_POOL.pool?.toLowerCase(), SHARED, "Base Sepolia's vault is the shared address");

const sdk = await import("@gloamtrade/sdk");
const core = await import("../src/core.js");
const { mockPool, stubProve } = await import("./helpers.js");

const SECRET = randomBytes(24).toString("hex");
const URL_ = "https://api.example.com/paid";

/** The same vault address on two chains, each with the chain id its RPC would answer. */
function chainPair() {
  const sepolia = mockPool(SHARED);
  const mainnet = mockPool(SHARED);
  return {
    sepolia: { ...sepolia, chain: { ...sepolia.chain, chainId: async () => 84532 } },
    mainnet: { ...mainnet, chain: { ...mainnet.chain, chainId: async () => 8453 } },
  };
}

/** A payer pays a base-mainnet ETH charge with a note in Base Sepolia's vault, broadcast on Base Sepolia. */
async function payWithSepoliaEth(server: ReturnType<typeof mockPool> & { chain: core.GloamChargeChain }, payer: ReturnType<typeof mockPool>) {
  const payee = await sdk.generateReceiveKey();
  const paywall = core.createGloamPaywall({
    secretKey: SECRET,
    network: "base-mainnet",
    currency: sdk.NATIVE_ASSET,
    server: { receiveKey: payee, chain: server.chain, prove: stubProve, submit: server.submitter("payee"), replay: core.memoryReplayStore() },
  });
  const charge = paywall.charge({ amount: "0.1" });
  const first = await charge(new Request(URL_));
  assert.equal(first.status, 402);
  if (first.status !== 402) throw new Error("unreachable");
  const challenge = core.parsePaymentChallenges(first.challenge.headers.get("www-authenticate"))[0]!;
  assert.equal(core.parseGloamChargeRequest(challenge.request).methodDetails.chainId, 8453);

  const secret = BigInt(`0x${randomBytes(16).toString("hex")}`);
  const amount = 10n ** 17n;
  const c = sdk.fieldToHex(await sdk.noteCommitmentPoseidon(secret, amount, sdk.NATIVE_ASSET));
  await payer.insert(c);
  const paid = await core.createGloamChargeCredential({
    challenge,
    note: { secret: sdk.fieldToHex(secret), amountWei: amount, path: await payer.path(c) },
    prove: stubProve,
    mode: "push",
    submit: payer.submitter("payer"),
  });
  const second = await charge(new Request(URL_, { headers: { Authorization: paid.authorization } }));
  const detail = second.status === 402 ? (JSON.parse(await second.challenge.text()) as { detail: string }).detail : "";
  return { status: second.status, detail };
}

test("a base-mainnet charge is refused when the server reads Base Sepolia, before anything is swept", async () => {
  const { sepolia } = chainPair();
  const r = await payWithSepoliaEth(sepolia, sepolia);
  assert.equal(r.status, 402, "a mainnet charge is never granted for a testnet payment");
  assert.match(r.detail, /chain 84532.*chain 8453|8453.*84532/);
  assert.deepEqual(sepolia.submitted, ["payer"], "the server swept nothing");
});

test("control: the same server reading Base mainnet settles a Base mainnet payment", async () => {
  const { mainnet } = chainPair();
  const r = await payWithSepoliaEth(mainnet, mainnet);
  assert.equal(r.status, 200);
  assert.deepEqual(mainnet.submitted, ["payer", "payee"]);
});

test("gloamChargeChainFromClient answers with the client's own chain id (asked of the RPC, not its label)", async () => {
  let asked = 0;
  // A client labelled Base mainnet whose RPC is Base Sepolia's: only eth_chainId tells.
  const client = { chain: { id: 8453 }, getChainId: async () => (asked++, 84532) } as never;
  const chain = core.gloamChargeChainFromClient(client, { pool: SHARED });
  assert.equal(await chain.chainId?.(), 84532);
  assert.equal(await chain.chainId?.(), 84532);
  assert.equal(asked, 1, "asked once per chain object");
});

test("the SDK sweep refuses to settle an x402 payment through a reader on another chain", async () => {
  const { sepolia } = chainPair();
  const payee = await sdk.generateReceiveKey();
  const secret = BigInt(`0x${randomBytes(16).toString("hex")}`);
  const amount = 10n ** 17n;
  const c = sdk.fieldToHex(await sdk.noteCommitmentPoseidon(secret, amount, sdk.NATIVE_ASSET));
  await sepolia.insert(c);
  const r = await sdk.sweepReceivedNote({
    note: { secret: sdk.fieldToHex(secret), commitment: c, amountWei: amount.toString(), asset: sdk.NATIVE_ASSET } as never,
    poolAddress: SHARED,
    chainId: 8453,
    prove: stubProve,
    chain: sepolia.chain,
    submit: sepolia.submitter("payee"),
  });
  void payee;
  assert.equal(r.final, false);
  assert.equal(r.status, "failed");
  assert.match(r.reason ?? "", /84532/);
  assert.deepEqual(sepolia.submitted, [], "nothing was submitted");
});

test("chain ids compare as numbers, whatever type a custom reader answers with", async () => {
  assert.equal(await sdk.sweepChainProblem({ chainId: async () => 8453n as unknown as number }, 8453), null);
  assert.equal(await sdk.sweepChainProblem({ chainId: async () => "8453" as unknown as number }, 8453), null);
  assert.match((await sdk.sweepChainProblem({ chainId: async () => 84532n as unknown as number }, 8453)) ?? "", /84532/);
  // a reader that does not say which chain it reads is not checked (custom readers should set chainId)
  assert.equal(await sdk.sweepChainProblem({}, 8453), null);
});
