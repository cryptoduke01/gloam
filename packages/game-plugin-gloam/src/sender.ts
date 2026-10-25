/**
 * How the agent's transactions get out.
 *
 * Two kinds of transaction leave a Gloam agent:
 *
 * - Deposits (add privately) start from the wallet that holds the agent's
 *   public funds, so that wallet signs them: an approve and shieldBound().
 * - Private payments, cash outs and payment messages are already authorized
 *   by their zero-knowledge proof. By default they go through the Gloam relay,
 *   so the agent's wallet never appears next to them and needs no gas there.
 *   The relay can only submit or refuse: the cash-out recipient is inside the
 *   proof. With submit "wallet" the agent's own wallet sends them instead (a
 *   local fork, or an operator who runs no relay).
 *
 * A CallSender is the wallet side. walletCallSender wraps a viem wallet (an
 * EOA whose key is in the agent's environment). acpCallSender wraps an ACP
 * agent's smart wallet from @virtuals-protocol/acp-node-v2, whose calls are
 * batched into one user operation and checked against that wallet's policy.
 */
import type { Account, Address, Chain, Hex, PublicClient, Transport, WalletClient } from "viem";

export type Call = { to: Address; data: Hex; value?: bigint };

export interface CallSender {
  /** The address that holds the agent's public funds and signs its deposits. */
  readonly address: Address;
  /**
   * Send the calls in order and resolve with the hash of the transaction
   * carrying the last one as soon as it is broadcast. The caller waits for its
   * receipt, so a receipt wait that gives up never hides a transaction that went out.
   *
   * Throw a NotSentError (or any error with `notSent: true`) only when the last
   * call was certainly not broadcast. Any other error means it may have been,
   * and the agent keeps every note of that send until the chain settles it.
   */
  sendCalls(calls: Call[]): Promise<Hex>;
}

/** The last call of a batch was never broadcast: nothing of that send can land. */
export class NotSentError extends Error {
  readonly notSent = true;
  constructor(message: string) {
    super(message);
    this.name = "NotSentError";
  }
}

/** True when an error says the send never went out. */
export function isNotSent(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { notSent?: unknown }).notSent === true);
}

/**
 * An EOA (viem wallet client with an account). Each earlier call (an approve)
 * is sent and mined before the next; the last is handed back once broadcast.
 */
export function walletCallSender(wallet: WalletClient<Transport, Chain, Account>, publicClient: PublicClient): CallSender {
  return {
    address: wallet.account.address,
    async sendCalls(calls) {
      if (!calls.length) throw new NotSentError("Nothing to send.");
      for (let i = 0; i < calls.length - 1; i++) {
        const c = calls[i]!;
        // Anything that goes wrong here happens before the last call is sent.
        try {
          const hash = await wallet.sendTransaction({ account: wallet.account, chain: wallet.chain, to: c.to, data: c.data, value: c.value ?? 0n });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted.`);
        } catch (e) {
          const why = (e as { shortMessage?: string }).shortMessage ?? (e instanceof Error ? e.message.split("\n")[0] : String(e));
          throw new NotSentError(`${why} The last call was not sent.`);
        }
      }
      const c = calls[calls.length - 1]!;
      const tx = { account: wallet.account, chain: wallet.chain, to: c.to, data: c.data, value: c.value ?? 0n };
      if (wallet.account.type !== "local") return wallet.sendTransaction(tx);
      // A local key: estimate and sign first, so a call that would revert, or a
      // key that cannot sign, is known not to have been sent. Only the broadcast
      // itself can leave it open.
      let signed: Hex;
      try {
        signed = await wallet.signTransaction(await wallet.prepareTransactionRequest(tx));
      } catch (e) {
        const why = (e as { shortMessage?: string }).shortMessage ?? (e instanceof Error ? e.message.split("\n")[0] : String(e));
        throw new NotSentError(`${why} Nothing was sent.`);
      }
      return wallet.sendRawTransaction({ serializedTransaction: signed });
    },
  };
}

/** The part of acp-node-v2's IEvmProviderAdapter this needs (PrivyAlchemyEvmProviderAdapter has it). */
export interface AcpEvmProviderLike {
  getAddress(): Promise<Address>;
  sendCalls(chainId: number, calls: { to: Address; data?: Hex; value?: bigint }[]): Promise<Address | Address[]>;
}

/**
 * An ACP agent's own smart wallet as the sender, so ACP earnings can go into
 * its private balance without leaving the wallet first. The wallet's policy
 * (set in the Virtuals dashboard) must allow the token's approve and the Gloam
 * vault; under the default ACP-only policy the call is refused.
 */
export async function acpCallSender(provider: AcpEvmProviderLike, chainId: number): Promise<CallSender> {
  const address = await provider.getAddress();
  return {
    address,
    // A user operation that throws or answers without a hash may still have gone
    // out, so neither is a NotSentError: the agent keeps the note pending.
    async sendCalls(calls) {
      const out = await provider.sendCalls(chainId, calls.map((c) => ({ to: c.to, data: c.data, value: c.value ?? 0n })));
      const hash = Array.isArray(out) ? out[out.length - 1] : out;
      if (!hash) throw new Error("The ACP wallet returned no transaction hash. The calls may still land.");
      return hash as Hex;
    },
  };
}
