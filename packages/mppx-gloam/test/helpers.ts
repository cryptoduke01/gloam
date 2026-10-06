/**
 * Test fixtures: an in-memory pool that follows ShieldPoolPoseidon.transfer's
 * rules (known root, nullifier spent once, fresh commitments, both outputs
 * inserted, a Transferred log on success), stub proofs, and funded payers.
 * Nothing touches a network.
 */
import type { Address, Hex } from "viem";
import {
  IncrementalMerkleTreePoseidon,
  fieldToHex,
  hexToField,
  noteCommitmentPoseidon,
  GLOAM_NETWORKS,
  TEMPO_PATHUSD,
  type Prover,
} from "@gloamtrade/sdk";
import { TRANSFERRED_TOPIC, type GloamChargeChain, type GloamSubmitter, type MinimalReceipt } from "../src/core.js";

export const TEMPO = GLOAM_NETWORKS.tempo;
export const POOL = TEMPO.pool;
export const CHAIN_ID = TEMPO.chainId;
export const USD = TEMPO_PATHUSD;
export const stubProve: Prover = async () => ({ proofBytes: "0xdeadbeef" });

const lc = (h: string) => h.toLowerCase();

export function mockPool(address: Address = POOL) {
  const tree = new IncrementalMerkleTreePoseidon();
  const index = new Map<string, number>();
  const roots = new Set<string>();
  const spent = new Set<string>();
  const receipts = new Map<string, MinimalReceipt>();
  const submitted: string[] = [];
  let n = 0;
  const insert = async (c: string) => {
    index.set(lc(c), await tree.insert(hexToField(c)));
    roots.add(lc(fieldToHex(tree.currentRoot)));
  };
  const nextHash = () => `0x${(++n).toString(16).padStart(64, "0")}` as Hex;

  /** Apply transfer(proof, root, nullifier, [c0, c1]); a rule break gives a reverted receipt. */
  async function transfer(args: readonly unknown[], emitter: Address = address): Promise<Hex> {
    const [, root, nullifier, outs] = args as [Hex, Hex, Hex, Hex[]];
    const hash = nextHash();
    const ok = roots.has(lc(root)) && !spent.has(lc(nullifier)) && outs.every((c) => !index.has(lc(c)));
    if (ok) {
      spent.add(lc(nullifier));
      for (const c of outs) await insert(c);
    }
    receipts.set(hash, {
      status: ok ? "success" : "reverted",
      logs: ok
        ? [
            {
              address: emitter,
              topics: [TRANSFERRED_TOPIC, lc(nullifier)],
              data: `0x${outs.map((c) => lc(c).slice(2)).join("")}`,
            },
          ]
        : [],
    });
    return hash;
  }

  const chain: GloamChargeChain = {
    isSpent: async (nf) => spent.has(lc(nf)),
    isCommitmentSeen: async (c) => index.has(lc(c)),
    pathForCommitment: async (c) => (index.has(lc(c)) ? tree.path(index.get(lc(c))!) : null),
    waitForReceipt: async (hash) => ({ status: receipts.get(hash)?.status ?? "reverted" }),
    getReceipt: async (hash) => receipts.get(hash) ?? null,
  };

  /** A submitter that records who submitted what. */
  const submitter = (who: string): GloamSubmitter => async (intent) => {
    submitted.push(who);
    return transfer(intent.exec.args);
  };

  return { tree, insert, transfer, chain, spent, receipts, submitted, submitter, path: (c: Hex) => tree.path(index.get(lc(c))!) };
}

export type MockPool = ReturnType<typeof mockPool>;

/** A payer note of `amount` base units sitting in the pool. */
export async function fundedNote(pool: MockPool, amount: bigint, secret = BigInt(Math.floor(Math.random() * 1e12)) + 1000n) {
  const c = fieldToHex(await noteCommitmentPoseidon(secret, amount, USD));
  await pool.insert(c);
  return { secret: fieldToHex(secret), amountWei: amount, path: await pool.path(c), commitment: c };
}
