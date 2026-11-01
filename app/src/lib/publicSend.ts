/**
 * What a public send from the wallet can carry, and the checks around it. A
 * public send is a plain transfer that never touches the vault, so no deposit
 * limit applies: every token listed on the chain is offered from the start, next
 * to the chain's native coin where it has one.
 */
import { cashOutTargetProblem } from "./cashOutTarget";
import { shieldTokensFor, type OnchainToken } from "./tokens";

/** The picker's value for the chain's native coin. */
export const NATIVE_CHOICE = "eth";

/** Tempo has no native coin: its nodes answer a wallet's native balance with a placeholder. */
export function hasNativeCoin(net: { family: string }): boolean {
  return net.family !== "tempo";
}

/** The tokens a public send offers on a chain: every listed one. */
export function publicSendTokens(chainId: number): OnchainToken[] {
  return shieldTokensFor(chainId);
}

/**
 * The token Public send has picked: the choice when this network has it, else
 * the native coin, else its first token. Null means the native coin. A choice
 * from another network falls back instead of naming a token that isn't here.
 */
export function pickedToken(
  choice: string,
  net: { family: string },
  tokens: readonly OnchainToken[]
): OnchainToken | null {
  const found = tokens.find((t) => t.id === choice);
  if (found) return found;
  return hasNativeCoin(net) ? null : (tokens[0] ?? null);
}

/**
 * Max for a token send, from the raw balance. Gas is paid in ETH everywhere but
 * Tempo, so the whole balance can go. On Tempo gas comes out of a stablecoin, so
 * about 0.02 of the token stays behind, the same reason a native send keeps its fee.
 */
export function maxTokenSend(balance: bigint, decimals: number, net: { family: string }): bigint {
  if (hasNativeCoin(net)) return balance;
  const keep = 2n * 10n ** BigInt(Math.max(0, decimals - 2));
  return balance > keep ? balance - keep : 0n;
}

/**
 * Why a public send to `to` would be lost, or null when it is fine: the same
 * addresses a cash out refuses (the vault, a token contract, a router, the
 * board, the zero address), since a transfer to one of them can't be got back.
 */
export function publicSendTargetProblem(to: string, net: Parameters<typeof cashOutTargetProblem>[1]): string | null {
  return cashOutTargetProblem(to, net)?.replace("Cash out to a wallet you control.", "Send to a wallet instead.") ?? null;
}
