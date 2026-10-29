/**
 * Taking a signed vote: check the input, the window, the signature and the
 * weight, then keep it if it is the wallet's latest. Server only. The API
 * route passes the vote, its snapshot and the clock in, so the self-test runs
 * the same code against a test vote.
 */
import "server-only";
import { createPublicClient, getAddress, isAddress, isHex, type Hex, type PublicClient } from "viem";
import { robinhood } from "../chain";
import { serverTransport } from "../serverRpc";
import type { VoteConfig } from "./config";
import {
  MAX_SIGNATURE_HEX,
  SIGNED_MAX_AGE_SEC,
  SIGNED_MAX_AHEAD_SEC,
  formatGloam,
  inWindow,
  signatureValid,
  voteMessage,
  voteTypedData,
  weightOf,
  type Ballot,
  type VoteMessage,
  type VoteSnapshot,
} from "./core";
import type { Excluded } from "./excluded";
import { saveBallot } from "./store";

export class VoteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoteError";
  }
}

export type BallotInput = { voter: `0x${string}`; option: number; timestamp: number; signature: Hex };

/** The body of a vote, checked for shape only. */
export function parseBallotInput(raw: unknown, v: VoteConfig): BallotInput {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voter = typeof b.voter === "string" ? b.voter.trim() : "";
  if (!isAddress(voter, { strict: false })) throw new VoteError(400, "bad_voter", "That wallet address doesn't look right.");
  const option = b.option;
  if (typeof option !== "number" || !Number.isInteger(option) || option < 0 || option >= v.options.length) {
    throw new VoteError(400, "bad_option", "Pick one of the options.");
  }
  const timestamp = b.timestamp;
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new VoteError(400, "bad_timestamp", "Something went wrong with that vote. Sign it again.");
  }
  const signature = typeof b.signature === "string" ? b.signature.trim() : "";
  if (!isHex(signature, { strict: true }) || signature.length < 132 || signature.length > MAX_SIGNATURE_HEX) {
    throw new VoteError(400, "bad_signature", "That signature doesn't look right. Sign again.");
  }
  return { voter: getAddress(voter), option, timestamp, signature: signature as Hex };
}

let rhClient: PublicClient | null = null;

/** ERC-1271 and ERC-6492 checks for smart wallets, over Robinhood Chain mainnet. */
export async function smartWalletCheck(message: VoteMessage, signature: Hex): Promise<boolean> {
  rhClient ??= createPublicClient({
    chain: robinhood,
    transport: serverTransport({ chainId: robinhood.id, chain: robinhood, historyRpc: null }, { timeout: 8_000, retryCount: 1 }),
  }) as PublicClient;
  return rhClient.verifyTypedData({ address: message.voter, ...voteTypedData(message), signature });
}

export type SubmitContext = {
  vote: VoteConfig;
  snapshot: VoteSnapshot;
  excluded: Map<string, Excluded>;
  /** ms */
  now?: number;
  contractCheck?: (message: VoteMessage, signature: Hex) => Promise<boolean>;
};

/** Checks and keeps one signed vote. Throws VoteError with a message the voter can act on. */
export async function submitBallot(raw: unknown, ctx: SubmitContext): Promise<{ ballot: Ballot; changed: boolean }> {
  const { vote: v, snapshot } = ctx;
  const now = ctx.now ?? Date.now();
  if (!inWindow(v, now)) {
    throw now < Date.parse(v.start)
      ? new VoteError(409, "not_open", "This vote hasn't opened yet.")
      : new VoteError(409, "closed", "This vote has closed.");
  }
  const input = parseBallotInput(raw, v);

  const nowSec = Math.floor(now / 1000);
  if (input.timestamp < nowSec - SIGNED_MAX_AGE_SEC || input.timestamp > nowSec + SIGNED_MAX_AHEAD_SEC) {
    throw new VoteError(400, "stale", "That signature is too old. Sign again.");
  }

  const message = voteMessage(v, input.option, input.voter, input.timestamp);
  if (!(await signatureValid(message, input.signature, ctx.contractCheck))) {
    throw new VoteError(401, "bad_signature", "That signature doesn't match this wallet. Sign again.");
  }

  const { weight, excluded } = weightOf(snapshot, ctx.excluded, input.voter);
  if (excluded) throw new VoteError(403, "excluded", `This address doesn't vote. ${excluded.reason}.`);
  if (weight === 0n) {
    throw new VoteError(
      403,
      "no_balance",
      `This wallet held no $GLOAM at block ${snapshot.block.toLocaleString("en-US")}, so it has no vote here.`,
    );
  }

  const ballot: Ballot = {
    voter: input.voter,
    option: input.option,
    choice: v.options[input.option]!,
    weight: weight.toString(),
    timestamp: input.timestamp,
    signature: input.signature,
    receivedAt: now,
  };
  const res = await saveBallot(v.id, ballot);
  // the same signature sent twice (a double tap, a retry): already in
  if (!res.saved && res.current.signature.toLowerCase() === input.signature.toLowerCase()) return { ballot: res.current, changed: false };
  if (!res.saved) {
    throw new VoteError(409, "newer", `A newer vote from this wallet is already in (${res.current.choice}, ${formatGloam(res.current.weight)} GLOAM).`);
  }
  return { ballot, changed: res.previous !== null };
}
