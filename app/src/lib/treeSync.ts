/**
 * Rebuild ShieldPool Merkle tree from on-chain Shielded events.
 * Needed for Merkle paths at unshield time (client cannot trust partial trees).
 */

import type { Address, Hex, PublicClient } from "viem";
import {
  SHIELD_DEPLOY_BLOCK,
  SHIELD_POOL_ADDRESS,
  shieldPoolAbi,
} from "./shield";
import { IncrementalMerkleTree } from "./merkle";

export type ChainLeaf = {
  leafIndex: number;
  commitment: Hex;
  asset: Address;
  amount: bigint;
  from: Address;
  txHash?: Hex;
};

export type SyncedTree = {
  tree: IncrementalMerkleTree;
  leaves: ChainLeaf[];
  /** Root after replaying all leaves */
  root: Hex;
  leafCount: number;
};

/**
 * Fetch every Shielded event and rebuild the keccak tree in leaf order.
 */
export async function syncShieldTree(
  client: PublicClient
): Promise<SyncedTree | null> {
  if (!SHIELD_POOL_ADDRESS) return null;

  const logs = await client.getLogs({
    address: SHIELD_POOL_ADDRESS,
    event: {
      type: "event",
      name: "Shielded",
      inputs: [
        { name: "commitment", type: "bytes32", indexed: true },
        { name: "asset", type: "address", indexed: true },
        { name: "amount", type: "uint256", indexed: false },
        { name: "leafIndex", type: "uint256", indexed: false },
        { name: "from", type: "address", indexed: true },
      ],
    },
    fromBlock: SHIELD_DEPLOY_BLOCK,
    toBlock: "latest",
  });

  const leaves: ChainLeaf[] = logs
    .map((log) => {
      const args = log.args as {
        commitment?: Hex;
        asset?: Address;
        amount?: bigint;
        leafIndex?: bigint;
        from?: Address;
      };
      return {
        leafIndex: Number(args.leafIndex ?? 0),
        commitment: (args.commitment ??
          "0x0000000000000000000000000000000000000000000000000000000000000000") as Hex,
        asset: (args.asset ??
          "0x0000000000000000000000000000000000000000") as Address,
        amount: args.amount ?? BigInt(0),
        from: (args.from ??
          "0x0000000000000000000000000000000000000000") as Address,
        txHash: log.transactionHash as Hex | undefined,
      };
    })
    .sort((a, b) => a.leafIndex - b.leafIndex);

  // densify: insert in order 0..n-1; skip gaps if any
  const tree = new IncrementalMerkleTree();
  for (const leaf of leaves) {
    if (leaf.leafIndex !== tree.nextIndex) {
      // fill shouldn't happen if chain is consistent; abort on gap
      if (leaf.leafIndex < tree.nextIndex) continue;
      throw new Error(
        `Leaf gap: expected index ${tree.nextIndex}, got ${leaf.leafIndex}`
      );
    }
    tree.insert(leaf.commitment);
  }

  return {
    tree,
    leaves,
    root: tree.currentRoot,
    leafCount: tree.nextIndex,
  };
}

/** Compare synced root to on-chain currentRoot() */
export async function assertTreeMatchesChain(
  client: PublicClient,
  synced: SyncedTree
): Promise<boolean> {
  if (!SHIELD_POOL_ADDRESS) return false;
  const onchain = (await client.readContract({
    address: SHIELD_POOL_ADDRESS,
    abi: shieldPoolAbi,
    functionName: "currentRoot",
  })) as Hex;
  return onchain.toLowerCase() === synced.root.toLowerCase();
}
