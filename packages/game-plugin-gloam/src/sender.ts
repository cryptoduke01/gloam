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
  /** Send the calls in order; resolve with the hash of the transaction carrying the last one, once it is mined. */
  sendCalls(calls: Call[]): Promise<Hex>;
}

/** An EOA (viem wallet client with an account): each call is sent and mined before the next. */
export function walletCallSender(wallet: WalletClient<Transport, Chain, Account>, publicClient: PublicClient): CallSender {
  return {
    address: wallet.account.address,
    async sendCalls(calls) {
      let last: Hex | null = null;
      for (const c of calls) {
        const hash = await wallet.sendTransaction({ account: wallet.account, chain: wallet.chain, to: c.to, data: c.data, value: c.value ?? 0n });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted.`);
        last = hash;
      }
      if (!last) throw new Error("Nothing to send.");
      return last;
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
    async sendCalls(calls) {
      const out = await provider.sendCalls(chainId, calls.map((c) => ({ to: c.to, data: c.data, value: c.value ?? 0n })));
      const hash = Array.isArray(out) ? out[out.length - 1] : out;
      if (!hash) throw new Error("The ACP wallet returned no transaction hash.");
      return hash as Hex;
    },
  };
}
