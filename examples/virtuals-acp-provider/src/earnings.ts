/**
 * Add ACP earnings to the private balance.
 *
 * When a job completes, ACP's escrow pays the provider's wallet in public. This
 * moves what has piled up there into the provider's Gloam balance, where it
 * funds the next payouts privately.
 *
 * A deposit into the vault is public too (the amount shows), so a deposit per
 * job would line up with each escrow payment. Instead earnings are added in
 * round amounts once at least `minBatch` has built up: the deposits stop
 * matching any single job. Anything under a round step stays in the wallet for
 * the next sweep.
 *
 * It adds only tokens the Gloam vault takes. ACP's escrow pays in USDC on Base
 * mainnet and USDG on Robinhood Chain mainnet, both of which it takes. On Base
 * Sepolia the escrow pays in Virtuals' own test token, which Gloam's Base
 * Sepolia vault does not list, so the sweep names it and leaves it; the
 * fund-transfer principal there is Circle's test USDC, which it adds.
 */
import { formatUnits, parseUnits, type Address } from "viem";
import type { GloamAgent } from "@gloamtrade/game-plugin-gloam";

const ERC20_BALANCE = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export interface EarningsSweeperOptions {
  wallet: GloamAgent;
  /**
   * The tokens that reach the wallet from ACP: the escrow's payment token
   * (ACP_CONTRACTS[chainId].paymentToken) and, for fund-transfer jobs, the
   * payout token. Each one the Gloam vault takes is added; the others are named.
   */
  tokens: Address[];
  /** Add only once this much has built up. Default "10". */
  minBatch?: string;
  /** Add in multiples of this. Default "5". */
  roundTo?: string;
  /** Leave this much in the wallet. Default "0". */
  keepPublic?: string;
}

export type TokenSweep = { token: Address; status: "added" | "skipped" | "error"; reason?: string; added?: string; hashes?: string[] };
export type SweepOutcome = { status: "added" | "skipped" | "error"; results: TokenSweep[] };

export class EarningsSweeper {
  constructor(private readonly opts: EarningsSweeperOptions) {}

  async sweep(): Promise<SweepOutcome> {
    const results: TokenSweep[] = [];
    const seen = new Set<string>();
    for (const t of this.opts.tokens) {
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      results.push(await this.sweepOne(t).catch((e) => ({ token: t, status: "error" as const, reason: String(e instanceof Error ? e.message : e) })));
    }
    const status = results.some((r) => r.status === "added") ? "added" : results.some((r) => r.status === "error") ? "error" : "skipped";
    return { status, results };
  }

  private async sweepOne(token: Address): Promise<TokenSweep> {
    const w = this.opts.wallet;
    const asset = w.network.assets.find((a) => a.address.toLowerCase() === token.toLowerCase());
    if (!asset) {
      return {
        token,
        status: "skipped",
        reason: `${token} is not a token Gloam's ${w.network.label} ${w.network.testnet ? "testnet" : "mainnet"} vault takes (it takes ${w.network.assets.map((a) => a.symbol).join(", ")}).`,
      };
    }
    const owner = w.walletAddress;
    if (!owner) return { token, status: "error", reason: "The provider's Gloam engine has no wallet." };
    const have = await w.publicClient.readContract({ address: asset.address, abi: ERC20_BALANCE, functionName: "balanceOf", args: [owner] });
    const keep = parseUnits(this.opts.keepPublic ?? "0", asset.decimals);
    const step = parseUnits(this.opts.roundTo ?? "5", asset.decimals);
    const min = parseUnits(this.opts.minBatch ?? "10", asset.decimals);
    const spare = have > keep ? have - keep : 0n;
    let amount = step > 0n ? (spare / step) * step : spare;
    if (amount < min) {
      return { token, status: "skipped", reason: `${formatUnits(spare, asset.decimals)} ${asset.symbol} waiting; adds start at ${formatUnits(min, asset.decimals)}.` };
    }
    const cap = asset.depositLimit?.perDeposit ?? amount;
    const hashes: string[] = [];
    let added = 0n;
    while (amount > 0n) {
      const part = amount > cap ? (cap / step) * step || cap : amount;
      const out = await w.add({ amount: formatUnits(part, asset.decimals), asset: asset.symbol, label: "ACP earnings" });
      if (out.status !== "done") {
        return { token, status: added ? "added" : "error", reason: String(out.message ?? out.code ?? out.status), added: `${formatUnits(added, asset.decimals)} ${asset.symbol}`, hashes };
      }
      hashes.push(String(out.hash));
      added += part;
      amount -= part;
    }
    return { token, status: "added", added: `${formatUnits(added, asset.decimals)} ${asset.symbol}`, hashes };
  }
}
