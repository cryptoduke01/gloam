/**
 * Which of this browser's notes the vault already shows spent. Every note is
 * asked at once, so the reads go out together (one Multicall3 call where the
 * chain has it, lib/rhClient) instead of one round trip per note: with 20
 * notes on Ethereum Sepolia that was 20 reads back to back before the balance
 * dropped a note spent from another browser.
 *
 * The rule is the one the vault view always used: a note with a secret and a
 * nullifier that is not already marked spent here is asked about; one the
 * vault answers `true` for is marked spent; one whose read fails is left as
 * it is (asked again on the next sync). Chain-only rows (no secret) are never
 * asked about, so the notes can be checked before the wallet's deposits are
 * read from the chain.
 */

import type { Hex, PublicClient } from "viem";
import type { GloamNetwork } from "./networks";
import { markNoteRecovered, notesOnNetwork, shieldPoolAbi, type LocalNote } from "./shield";

/** The notes of `net` the vault is asked about. */
export function spentCheckCandidates(notes: readonly LocalNote[], net: Pick<GloamNetwork, "chainId" | "pool">): LocalNote[] {
  return notesOnNetwork(notes, net).filter(
    (n) => n.nullifier && n.nullifier !== "0x" && n.status !== "recovered" && n.secret && n.secret !== "0x"
  );
}

/**
 * Ask the vault of `net` about each candidate note at once and mark the spent
 * ones. True when any was marked.
 */
export async function markSpentNotes(
  client: Pick<PublicClient, "readContract">,
  notes: readonly LocalNote[],
  net: Pick<GloamNetwork, "chainId" | "pool">,
  mark: (id: string) => void = markNoteRecovered
): Promise<boolean> {
  const pool = net.pool;
  if (!pool) return false;
  const candidates = spentCheckCandidates(notes, net);
  const answers = await Promise.allSettled(
    candidates.map(
      (n) =>
        client.readContract({
          address: pool,
          abi: shieldPoolAbi,
          functionName: "isSpent",
          args: [n.nullifier as Hex],
        }) as Promise<boolean>
    )
  );
  let any = false;
  answers.forEach((a, i) => {
    if (a.status === "fulfilled" && a.value === true) {
      mark(candidates[i]!.id);
      any = true;
    }
  });
  return any;
}
