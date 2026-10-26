/**
 * The decisions in an Add privately (components/app/ShieldView), kept apart
 * from the view so they can be checked (scripts/selftest-add-privately.mts).
 */
import type { Address, Hex } from "viem";
import { allNetworks, networkName, type GloamNetwork } from "./networks";
import { isNativeAsset, type LocalNote } from "./shield";

export type DepositCall = {
  address: Address;
  functionName: "shieldBound" | "shield";
  args: readonly [Address, bigint, Hex, Hex] | readonly [Address, bigint, Hex];
  /** Sent with the call: the amount for native ETH, nothing for a token the vault pulls. */
  value: bigint | undefined;
};

/**
 * The vault call that deposits `note`, built from the note alone (its chain,
 * vault, asset, amount and commitment), never from what the form shows by the
 * time it goes out: an asset picked again while the approval was mined would
 * otherwise send this note's proof with another asset, and the vault reverts
 * it. Null when the page is on another chain or vault by then: send nothing.
 * `proofBytes` is the shield proof (shieldBound), or null for a pool that takes
 * plain shield().
 */
export function depositCall(
  note: Pick<LocalNote, "chainId" | "pool" | "asset" | "amountWei" | "commitment">,
  net: { chainId: number; pool: Address | null },
  proofBytes: Hex | null
): DepositCall | null {
  if (!net.pool || note.chainId !== net.chainId || note.pool.toLowerCase() !== net.pool.toLowerCase()) return null;
  const amount = BigInt(note.amountWei);
  const value = isNativeAsset(note.asset) ? amount : undefined;
  return proofBytes
    ? { address: note.pool, functionName: "shieldBound", args: [note.asset, amount, note.commitment, proofBytes], value }
    : { address: note.pool, functionName: "shield", args: [note.asset, amount, note.commitment], value };
}

/**
 * Why a deposit stopped before it went out: the page is on another network
 * than the note's by then. It names the deposit's network, the one to go back
 * to, whichever network the wallet is on.
 */
export function networkMovedMessage(noteChainId: number, page: Pick<GloamNetwork, "chainId" | "label" | "testnet" | "family">): string {
  const from = allNetworks().find((n) => n.chainId === noteChainId);
  if (page.chainId === noteChainId) return "The vault changed before your deposit went out, so nothing was deposited. Reload the page and try again.";
  return `The page moved to ${networkName(page)} before your deposit went out, so nothing was deposited. Switch back to ${from ? networkName(from) : "the network you started on"} and try again.`;
}

/**
 * After the wait for an approval's receipt gave up: go on to the deposit only
 * when it was the last approval, the deposit is still wanted, and the
 * allowance read now covers it. Otherwise stop and say so; the approval is
 * never offered again on a stale read.
 */
export function depositAfterLostApproval(s: {
  depositWanted: boolean;
  amount: bigint | null;
  approvalsLeft: number;
  allowance: bigint | undefined;
}): boolean {
  return s.depositWanted && s.amount !== null && s.approvalsLeft === 0 && s.allowance !== undefined && s.allowance >= s.amount;
}

/**
 * Which of the form's transactions a hash is: the deposit's own receipt is the
 * only one whose lost wait means "your deposit was sent". The wallet hands the
 * hash back after the write is made, so the kind is noted at the write.
 */
export function createTxLog() {
  let writing: "approve" | "shield" | null = null;
  let deposit: string | null = null;
  return {
    /** Called right before a write goes to the wallet. */
    writing(kind: "approve" | "shield") {
      writing = kind;
    },
    /** Called when the wallet hands back a hash. */
    handed(hash: string | undefined) {
      if (hash && writing === "shield") deposit = hash;
    },
    /** A new deposit starts. */
    clear() {
      writing = null;
      deposit = null;
    },
    isDeposit(hash: string | undefined): boolean {
      return Boolean(hash) && hash === deposit;
    },
  };
}
