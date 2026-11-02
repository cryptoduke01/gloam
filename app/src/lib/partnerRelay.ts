/**
 * The partner relay (POST /api/v1/relay): one proven action sent through the Gloam
 * relay's own functions (lib/relay/server), then counted to the partner whose key sent
 * it (lib/partners recordActivity). Nothing is ever charged.
 *
 * What is counted, and from what:
 *   transfer  a private payment, with nothing about it but that it happened
 *   unshield  a cash out, with its asset and amount (public inputs of its proof)
 *   swap      a private swap, with its input's asset and amount (public inputs of
 *             its unshield proof), but only when the vault read the note as unspent
 *             just before the send: a spent note can only take the refund path,
 *             which brings money back and is not a swap
 *   memo      a payment message, not counted
 *   swapExit  a swap's money leaving by its exit key, not counted
 * Whether a swap is new is read from the vault, never taken from the request.
 *
 * Server only. The relay functions and the vault read are injectable for tests.
 */
import type { Address, Hex } from "viem";
import { logSafe } from "./logSafe";
import { recordActivity, type ActivityKind, type ActivityRecord, type Partner } from "./partners";
import type { GloamNetwork } from "./networks";
import { swapRouterFor } from "./vaultSwap";
import {
  RelayError,
  asAddress,
  asAmount,
  asBytes32,
  relayMemo,
  relayPoolAbi,
  relayPublicClient,
  relayTransfer,
  relayUnshield,
  relayVaultSwap,
  relayVaultSwapExit,
} from "./relay/server";

export type PartnerRelayAction = "transfer" | "unshield" | "memo" | "swap" | "swapExit";
export const PARTNER_RELAY_ACTIONS: readonly PartnerRelayAction[] = ["transfer", "unshield", "memo", "swap", "swapExit"];

export type Attribution =
  | { recorded: true; kind: ActivityKind; activity: ActivityRecord }
  | { recorded: false; kind: ActivityKind | null; reason: "not_billable" | "duplicate" | "storage_error" };

export type PartnerRelayDeps = {
  relayTransfer: (net: GloamNetwork, body: Record<string, unknown>) => Promise<Hex>;
  relayUnshield: (net: GloamNetwork, body: Record<string, unknown>) => Promise<Hex>;
  relayMemo: (net: GloamNetwork, body: Record<string, unknown>, requester?: string) => Promise<Hex>;
  relayVaultSwap: (net: GloamNetwork, body: Record<string, unknown>) => Promise<Hex>;
  relayVaultSwapExit: (net: GloamNetwork, body: Record<string, unknown>) => Promise<Hex>;
  /** The vault's spent(nullifier), read on the relay's own node. */
  isSpent: (net: GloamNetwork, nullifier: Hex) => Promise<boolean>;
  record: typeof recordActivity;
};

export const partnerRelayDeps: PartnerRelayDeps = {
  relayTransfer,
  relayUnshield,
  relayMemo,
  relayVaultSwap,
  relayVaultSwapExit,
  isSpent: async (net, nullifier) =>
    Boolean(await relayPublicClient(net).readContract({ address: net.pool!, abi: relayPoolAbi, functionName: "spent", args: [nullifier] })),
  record: recordActivity,
};

export class UnknownRelayAction extends RelayError {
  constructor() {
    super('action must be "transfer", "unshield", "memo", "swap" or "swapExit".', 400, "bad_action");
  }
}

/**
 * Sends one action and counts it to `partner`. A transaction that was sent is never
 * failed over accounting: a storage error comes back as attribution.reason.
 */
export async function relayForPartner(
  args: { net: GloamNetwork; body: Record<string, unknown>; partner: Partner; keyId: string },
  deps: PartnerRelayDeps = partnerRelayDeps
): Promise<{ hash: Hex; action: PartnerRelayAction; attribution: Attribution }> {
  const { net, body, partner, keyId } = args;
  let hash: Hex;
  let kind: ActivityKind | null = null;
  let edge: { asset: Address; amount: bigint } | null = null;
  switch (body.action) {
    case "transfer":
      hash = await deps.relayTransfer(net, body);
      kind = "private_payment";
      break;
    case "unshield":
      hash = await deps.relayUnshield(net, body);
      kind = "cash_out";
      // Public inputs of the cash-out proof, already validated by the relay.
      edge = { asset: asAddress(body.asset, "asset"), amount: asAmount(body.amount) };
      break;
    case "memo":
      hash = await deps.relayMemo(net, body, `key:${keyId}`);
      break;
    case "swap": {
      // the relay's own first refusal, before anything is read from the chain
      if (!swapRouterFor(net.chainId)) throw new RelayError("Private swaps are not live on this network yet.", 400, "no_swap");
      const spend = (body.spend ?? {}) as Record<string, unknown>;
      const nullifier = asBytes32(spend.nullifier, "nullifier");
      const swapEdge = { asset: asAddress(spend.asset, "asset"), amount: asAmount(spend.amount) };
      // Read before the send: a note already spent can only take the refund path, which is not a swap.
      let spent: boolean;
      try {
        spent = await deps.isSpent(net, nullifier);
      } catch {
        throw new RelayError("Could not read the vault right now. Nothing was sent. Try again shortly.", 503, "check_failed");
      }
      hash = await deps.relayVaultSwap(net, body);
      if (!spent) {
        kind = "private_swap";
        // The swap's input: public inputs of its unshield proof, which the relay's dry run checked.
        edge = swapEdge;
      }
      break;
    }
    case "swapExit":
      hash = await deps.relayVaultSwapExit(net, body);
      break;
    default:
      throw new UnknownRelayAction();
  }

  let attribution: Attribution;
  if (!kind) {
    attribution = { recorded: false, kind: null, reason: "not_billable" };
  } else {
    try {
      const r = await deps.record({ partner, keyId, network: net, kind, txHash: hash, edge });
      attribution = r.recorded ? { recorded: true, kind, activity: r.record } : { recorded: false, kind, reason: r.reason };
    } catch (e) {
      console.error("gloam_api_attribution", logSafe(e));
      attribution = { recorded: false, kind, reason: "storage_error" };
    }
  }
  return { hash, action: body.action as PartnerRelayAction, attribution };
}
