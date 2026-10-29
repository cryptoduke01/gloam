/**
 * Self-test: what a shared proof lets its holder find later (GHSA-x8fx-frxx-7f66).
 *
 *  - A proof of funds carries each backing note's spend nullifier, the same
 *    value a cash out of that whole note emits as an indexed topic of
 *    Unshielded(nullifier, asset, to, amount). Built here with the SDK's own
 *    witness builders, so the link is shown, not assumed.
 *  - So a note that backed a proof of funds is never cashed out or swapped as
 *    it is: it is moved to a fresh note of its own first (spendPlanFor says
 *    "move"), even for the whole amount, and only the fresh note's nullifier,
 *    which no proof carries, reaches the cash out. A split for part of a note
 *    already spends it in a private transfer first.
 *  - The split step takes the whole note only when asked to (allowWhole).
 *  - An Exact balance proof carries the note's commitment, which a deposit's
 *    Shielded(..., from) log names next to the depositing wallet: a deposit
 *    note is refused, with a way out.
 *
 * Nothing touches a chain: logs are built from the pool's event ABI.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-proof-privacy.mts
 */
import assert from "node:assert/strict";
import "./browser-shim.mjs";
import { decodeEventLog, encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import {
  IncrementalMerkleTreePoseidon,
  buildFundsWitness,
  buildUnshieldIntent,
  fieldToHex,
  noteCommitmentPoseidon,
  type PoseidonMerklePath,
} from "@gloamtrade/sdk";

const { spendPlanFor, splitNote } = await import("../src/lib/cashOutSplit");
const { balanceProofProblem } = await import("../src/lib/proofs/prove");
type LocalNote = import("../src/lib/shield").LocalNote;

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const POOL = "0x39e28cde55cab798874746ac52cb4b5cc99a0194" as Address;
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address;
const CASH_OUT_TO = "0x00000000000000000000000000000000c0ffee01" as Address;
const UNSHIELDED = {
  type: "event",
  name: "Unshielded",
  inputs: [
    { name: "nullifier", type: "bytes32", indexed: true },
    { name: "asset", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

await test("the leak: a proof of funds names the nullifier a whole-note cash out later emits", async () => {
  const tree = new IncrementalMerkleTreePoseidon();
  const secret = 0x5eed1234n;
  const amount = 1_200_000_000n;
  const commitment = await noteCommitmentPoseidon(secret, amount, USDG);
  const index = await tree.insert(commitment);
  const path = (await tree.path(index)) as PoseidonMerklePath;
  const funds = await buildFundsWitness({
    asset: USDG,
    threshold: 1_000_000_000n,
    context: 1n,
    notes: [{ secretHex: fieldToHex(secret), amount, path }],
  });
  assert.equal(funds.blocker, null);
  const inProof = fieldToHex(funds.publicInputs.nullifiers[0]!);
  const cashOut = await buildUnshieldIntent({
    secretHex: fieldToHex(secret),
    amountWei: amount,
    asset: USDG,
    to: CASH_OUT_TO,
    path,
    prove: async () => ({ proofBytes: "0xdeadbeef" as Hex }),
    poolAddress: POOL,
    chainId: 4663,
  });
  const onChain = (cashOut.exec.args as readonly unknown[])[2] as Hex;
  assert.equal(onChain.toLowerCase(), inProof.toLowerCase(), "the cash out spends the very nullifier the proof carries");
  // the pool's log for that cash out, and one filter on the proof's nullifier
  const log = {
    topics: encodeEventTopics({ abi: [UNSHIELDED], eventName: "Unshielded", args: { nullifier: onChain, asset: USDG, to: CASH_OUT_TO } }),
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
  // eth_getLogs({ topics: [Unshielded, nullifier] }): the holder's one filter
  const found = [log]
    .filter((l) => l.topics[1]?.toString().toLowerCase() === inProof.toLowerCase())
    .map((l) => decodeEventLog({ abi: [UNSHIELDED], topics: l.topics as [Hex, ...Hex[]], data: l.data }));
  assert.equal(found.length, 1);
  assert.equal(found[0]!.args.to.toLowerCase(), CASH_OUT_TO.toLowerCase());
  assert.equal(found[0]!.args.amount, amount);
});

const note = (over: Partial<LocalNote> = {}): LocalNote => ({
  id: "n1",
  chainId: 4663,
  pool: POOL,
  asset: USDG,
  amountWei: "1000",
  commitment: ("0x" + "11".repeat(32)) as Hex,
  secret: ("0x" + "22".repeat(32)) as Hex,
  scheme: "poseidon",
  bound: true,
  leafIndex: 3,
  createdAt: 1,
  ...over,
});

await test("the fix: a note behind a proof of funds is moved to a fresh note before a whole cash out or swap", () => {
  assert.equal(spendPlanFor(note(), 1000n), "direct");
  assert.equal(spendPlanFor(note(), 400n), "split");
  assert.equal(spendPlanFor(note({ fundsProofAt: 1_800_000_000_000 }), 1000n), "move");
  // part of a marked note is split off, which spends the marked note in a private transfer first
  assert.equal(spendPlanFor(note({ fundsProofAt: 1_800_000_000_000 }), 400n), "split");
});

await test("the split step refuses the whole note unless asked to move it whole", async () => {
  const args = {
    note: note(),
    amount: 1000n,
    path: {} as never,
    owner: CASH_OUT_TO,
    relayOn: true,
    sendWithWallet: async () => {
      throw new Error("not reached");
    },
    onStatus: () => {},
  };
  await assert.rejects(splitNote(args), /Pick an amount below this balance/);
  await assert.rejects(splitNote({ ...args, amount: 1001n, allowWhole: true }), /Pick an amount below this balance/);
});

await test("an Exact balance proof of a deposit is refused; payments, change and trades are not", () => {
  assert.match(balanceProofProblem("deposit") ?? "", /deposit/i);
  assert.match(balanceProofProblem("deposit") ?? "", /wallet/i);
  assert.equal(balanceProofProblem("payment"), null);
  assert.equal(balanceProofProblem("change"), null);
  assert.equal(balanceProofProblem("trade"), null);
});

console.log(`\nproof privacy: ${passed} passed`);
