/**
 * Private swaps for the agent: quote one, make one, and finish one any way it ends.
 *
 * A private swap spends one whole note: it leaves the vault through a one-time
 * escrow, trades on a public DEX, and the new note goes back in, in one transaction
 * the Gloam relay sends. Who swapped stays private; the tokens and the amounts are
 * public. The planning, the checks and the proofs are the SDK's (swapIntent), the
 * same as the Gloam app's.
 *
 *   gloam_swap_quote           read only: the price, and anything that would stop the swap
 *   gloam_execute_private_swap proves locally and sends through the relay, under the
 *                              owner's limits ("swap" must be listed in tools)
 *   gloam_finish_swap          a swap whose money waits at its escrow: the refund, or the exit
 *
 * The rule that keeps the money: both notes a swap makes (the new note and the refund
 * note, which also holds the swap's exit key) are in the note store before anything
 * is sent, and the refund note stays there, dead if need be, as long as the swapped
 * note's unshield proof could still land. A swap is never sent from the agent's wallet:
 * that would put the wallet next to the swap on the explorer.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatUnits, getAddress, isAddress, parseUnits, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import {
  GLOAM_RELAY_URL,
  GloamRelayError,
  RELAY_MAYBE_SENT,
  RH_WETH,
  SWAP_PUBLIC,
  SwapRefusedError,
  assertSwapSendable,
  buildPrivateSendIntent,
  buildSwapExit,
  buildSwapIntent,
  buildSwapRefund,
  fieldToHex,
  hexToField,
  noteCommitmentPoseidon,
  quoteSwap,
  readSwapOutcome,
  swapChainIds,
  swapJson,
  swapRouterFor,
  vaultSwapAssets,
  type GloamIntent,
  type Prover,
  type RelayNetworkStatus,
  type RelayOptions,
  type SwapOutcome,
  type SwapQuote,
  type SwapRelayCall,
  type syncTree,
} from "@gloamtrade/sdk";
import { KNOWN_ASSETS, type Spend } from "./policy.js";
import { authorizeSpend, settleSpend } from "./spendGuard.js";
import { deadCheckDue, noteView, type NoteStore, type StoredNote } from "./noteStore.js";
import { describeNetwork, networkByChainId, networkByKey, type McpNetwork, type NetworkKey } from "./networks.js";

type Env = Record<string, string | undefined>;
type ToolAnswer = { content: { type: "text"; text: string }[] };
type ChainClient = PublicClient;

/** What the swap tools need from the server they live in. */
export interface SwapToolContext {
  env: Env;
  text: (value: unknown) => ToolAnswer;
  networkArg: (what: string) => z.ZodDefault<z.ZodEnum<[NetworkKey, ...NetworkKey[]]>>;
  openStore: () => { ok: true; store: NoteStore } | { ok: false; error: string };
  tryStore: (fn: () => void) => string | undefined;
  errMsg: (e: unknown) => string;
  /** The chain reads for a network: the signer's client when there is one, else a public one. */
  client: (net: McpNetwork) => ChainClient;
  shieldProver: (net: McpNetwork) => Promise<Prover>;
  unshieldProver: (net: McpNetwork) => Promise<Prover>;
  transferProver: (net: McpNetwork) => Promise<Prover>;
  syncTree: typeof syncTree;
  /** A private send through the relay (the split before a swap). */
  relay: (intent: GloamIntent, opts: RelayOptions) => Promise<Hex>;
  /** A swap, a refund or an exit through the relay. */
  relaySwap: (call: SwapRelayCall, opts: RelayOptions) => Promise<Hex>;
  relayStatus: (opts: RelayOptions) => Promise<RelayNetworkStatus[]>;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What a swap leaves on chain, in one line. */
export const SWAP_PRIVACY = `${SWAP_PUBLIC} The Gloam relay sends it, so this server's wallet is not next to it either.`;
const ONE_NOTE =
  "A swap spends one whole note. With an amount below a note's value, the note is first split with a private send to this server's own notes, and the part of the right size is swapped.";

const erc20MetaAbi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

type AssetRef = { address: Address; symbol: string; decimals: number | null };

/** "ETH", "USDC", a 0x address, or a token the router swaps whose symbol the chain says. */
async function resolveAsset(net: McpNetwork, client: ChainClient, input: string): Promise<AssetRef | { error: string }> {
  const s = input.trim();
  let address: Address | null = null;
  if (isAddress(s, { strict: false })) address = getAddress(s);
  else if (/^eth$/i.test(s)) address = zeroAddress;
  else if (/^weth$/i.test(s) && net.chainId === 4663) address = RH_WETH;
  else {
    const known = KNOWN_ASSETS.find((a) => a.chainId === net.chainId && a.symbol.toLowerCase() === s.toLowerCase());
    if (known) address = known.address;
  }
  if (!address) {
    // a token the router swaps that this server doesn't list: its symbol, as the token says it
    const candidates = vaultSwapAssets(net.chainId).filter((a) => !same(a, zeroAddress));
    const symbols = await Promise.all(
      candidates.map((a) => client.readContract({ address: a, abi: erc20MetaAbi, functionName: "symbol" }).catch(() => null))
    );
    const i = symbols.findIndex((x) => typeof x === "string" && x.toLowerCase() === s.toLowerCase());
    if (i >= 0) address = candidates[i]!;
  }
  if (!address) return { error: `"${s}" is not an asset this server knows on ${describeNetwork(net)}. Pass its 0x token address.` };
  return describeAsset(net, client, address);
}

async function describeAsset(net: McpNetwork, client: ChainClient, address: Address): Promise<AssetRef> {
  if (same(address, zeroAddress)) return { address: zeroAddress, symbol: "ETH", decimals: 18 };
  const known = KNOWN_ASSETS.find((a) => a.chainId === net.chainId && same(a.address, address));
  if (known) return { address: getAddress(address), symbol: known.symbol, decimals: known.decimals };
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address, abi: erc20MetaAbi, functionName: "decimals" }).catch(() => null),
    client.readContract({ address, abi: erc20MetaAbi, functionName: "symbol" }).catch(() => null),
  ]);
  return { address: getAddress(address), symbol: typeof symbol === "string" ? symbol : `${address.slice(0, 6)}…${address.slice(-4)}`, decimals: decimals == null ? null : Number(decimals) };
}

const units = (v: bigint, a: AssetRef) => (a.decimals == null ? `${v} base units` : `${formatUnits(v, a.decimals)} ${a.symbol}`);

/** A quote as the agent sees it: plain JSON, amounts in units and base units. */
function quoteView(net: McpNetwork, q: SwapQuote, from: AssetRef, to: AssetRef) {
  const stop = q.stop ? (swapJson(q.stop) as Record<string, unknown>) : null;
  return {
    status: q.stop ? "stopped" : "ok",
    network: net.key,
    router: q.router,
    routerVersion: q.routerVersion,
    pay: { asset: from.address, symbol: from.symbol, amount: units(q.amountIn, from), amountWei: q.amountIn.toString() },
    receive: { asset: to.address, symbol: to.symbol, amount: units(q.plan.amountOut, to), amountWei: q.plan.amountOut.toString() },
    vaultFee: { bps: q.feeBps, amount: units(q.amountIn - q.plan.available, from) },
    route: { hops: q.plan.route.length, venue: q.venue },
    impactBps: q.plan.impactBps ?? null,
    pegBps: q.plan.pegBps ?? null,
    warnings: q.warnings,
    stop: stop
      ? {
          ...stop,
          ...(q.stop!.maxIn !== undefined ? { maxIn: units(q.stop!.maxIn, from) } : {}),
          ...(q.stop!.fitsIn !== undefined ? { fitsIn: units(q.stop!.fitsIn, from) } : {}),
        }
      : null,
    limits: {
      mostOneSwapSpends: q.limits.maxIn == null ? null : units(q.limits.maxIn, from),
      vaultRoomForWhatYouReceive: q.limits.outRoom == null ? null : units(q.limits.outRoom, to),
    },
    relayFloorUsd: q.floorUsd,
    spends: ONE_NOTE,
    public: SWAP_PRIVACY,
  };
}

function notLive(net: McpNetwork) {
  const on = swapChainIds()
    .map((id) => networkByChainId(id))
    .filter((n): n is McpNetwork => Boolean(n))
    .map(describeNetwork);
  return {
    status: "not_live",
    network: net.key,
    message: `Private swaps are not live on ${describeNetwork(net)} yet.${on.length ? ` They run on ${on.join(" and ")}.` : ""}`,
  };
}

function refusedView(e: unknown, errMsg: (e: unknown) => string) {
  if (e instanceof SwapRefusedError) {
    return {
      status: "refused",
      code: e.code,
      message: e.message,
      ...(e.maxIn !== undefined ? { maxInWei: e.maxIn.toString() } : {}),
      ...(e.fitsIn !== undefined ? { fitsInWei: e.fitsIn.toString() } : {}),
      ...(e.floorUsd !== undefined ? { floorUsd: e.floorUsd } : {}),
    };
  }
  return { status: "error", error: errMsg(e) };
}

/** The relay's state for a chain, best effort and quick: nothing is refused for not knowing it. */
async function relayFor(ctx: SwapToolContext, chainId: number): Promise<RelayNetworkStatus | null> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000).unref?.());
  const read = ctx.relayStatus({ url: swapRelayUrl(ctx.env) }).then((all) => all.find((s) => s.chainId === chainId) ?? null, () => null);
  return Promise.race([read, timeout]);
}

/** Swaps always go through a relay: GLOAM_RELAY_URL, else Gloam's. */
export function swapRelayUrl(env: Env): string {
  return env.GLOAM_RELAY_URL?.trim() || GLOAM_RELAY_URL;
}

// ------------------------------------------------------------------ settling a swap's notes

/** The notes a swap touched, found from its refund note. */
function swapNotes(store: NoteStore, refund: StoredNote) {
  const all = store.list();
  const rec = refund.swap!;
  return {
    out: all.find((n) => n.swapPair === refund.handle),
    input: all.find((n) => same(n.nullifier, rec.spent.nullifier) && n.chainId === rec.chainId),
  };
}

/**
 * Brings a swap's notes in line with what the chain says, and says what to do next.
 * A note that can never land is marked dead (its secret kept), never removed.
 */
export function applySwapOutcome(store: NoteStore, refund: StoredNote, outcome: SwapOutcome, tryStore: (fn: () => void) => string | undefined): string {
  const { out, input } = swapNotes(store, refund);
  const set = (n: StoredNote | undefined, patch: Partial<StoredNote>) => n && tryStore(() => void store.update(n.handle, patch));
  const dead = (n: StoredNote | undefined) => n && n.status !== "dead" && n.status !== "spent" && tryStore(() => void store.markDead(n.handle));
  // only a note still waiting to land (pending, or dead in case a read was wrong) becomes spendable; one already spent stays spent
  const landed = (n: StoredNote | undefined) => n && (n.status === "pending" || n.status === "dead") && set(n, { status: "unspent" });
  const inputSpent = () => input && input.status !== "spent" && set(input, { status: "spent", recheck: false });
  switch (outcome.state) {
    case "swapped":
      landed(out);
      dead(refund);
      inputSpent();
      return `swapped: ${out?.handle ?? "the new note"} is in the private balance`;
    case "refunded":
      landed(refund);
      dead(out);
      inputSpent();
      return `refunded: ${refund.handle} is back in the private balance`;
    case "refund_ready":
      inputSpent();
      dead(out);
      if (refund.status === "dead") set(refund, { status: "pending", pending: "create" });
      return `its money waits at the swap's escrow: call gloam_finish_swap with note ${refund.handle} to bring it back`;
    case "exit_ready":
      inputSpent();
      dead(out);
      if (refund.status === "dead") set(refund, { status: "pending", pending: "create" });
      return `its money waits at the swap's escrow and the refund note can't take it: call gloam_finish_swap with note ${refund.handle} and a "to" address`;
    case "closed":
      inputSpent();
      dead(out);
      dead(refund);
      return "closed: the note was spent and nothing waits at the escrow";
    case "reverted":
    case "expired":
      // The swap itself can't land. Its unshield proof is public until the note is spent,
      // so the refund note is kept (dead), and the note is spendable again.
      dead(out);
      dead(refund);
      if (input && input.status === "pending") set(input, { status: "unspent", recheck: true });
      return `${outcome.state === "expired" ? "its deadline passed" : "it reverted"}: it can't land, and ${input?.handle ?? "the note"} is spendable again. Spending that note ends the swap for good.`;
    case "pending":
      return "still open: the swap may land";
  }
}

/** The refresh pass for swaps, inside gloam_list_notes: read each open swap's outcome and settle its notes. */
export async function refreshSwapNotes(ctx: Pick<SwapToolContext, "client" | "errMsg" | "tryStore">, store: NoteStore): Promise<string[]> {
  const out: string[] = [];
  const open = store.list().filter((n) => n.origin === "swap_refund" && n.swap && (n.status === "pending" || (n.status === "dead" && deadCheckDue(n))));
  for (const refund of open) {
    const net = networkByChainId(refund.chainId);
    if (!net) continue;
    try {
      const outcome = await readSwapOutcome(ctx.client(net), refund.swap!);
      if (refund.status === "dead") {
        const now = new Date(Date.now()).toISOString();
        ctx.tryStore(() => void store.update(refund.handle, { checkedAt: now }));
        // a dead refund note comes back only when something changed for it
        if (outcome.state === "reverted" || outcome.state === "expired" || outcome.state === "closed" || outcome.state === "pending") continue;
        const o = swapNotes(store, refund).out;
        if (outcome.state === "swapped" && o && o.status !== "pending" && o.status !== "dead") continue;
      }
      out.push(`swap ${refund.handle}: ${applySwapOutcome(store, store.get(refund.handle)!, outcome, ctx.tryStore)}`);
    } catch (e) {
      out.push(`swap ${refund.handle}: could not check (${ctx.errMsg(e)})`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ the tools

export function registerSwapTools(server: McpServer, ctx: SwapToolContext): void {
  const { text, env, errMsg, tryStore } = ctx;

  server.registerTool(
    "gloam_swap_quote",
    {
      title: "Quote a private swap",
      description:
        "Read only. Price a private swap of one note's value from one asset into another on a Gloam network, with everything that would stop it: price impact and peg on Base and Ethereum, the vault's limits (the refund note must fit, the vault must take what you receive), the vault's cash-out fee read live, and where gas is dear the relay's smallest swap. A private swap hides who swapped; the tokens and the amounts are public. Swap with gloam_execute_private_swap.",
      inputSchema: {
        network: ctx.networkArg("Which network to swap on:"),
        from: z.string().optional().describe('What you pay: a symbol ("USDG", "USDC", "ETH") or a 0x token address. Left out with a note handle: the note\'s asset.'),
        to: z.string().describe('What you receive: a symbol or a 0x token address ("ETH" is native ETH).'),
        amount: z.number().positive().optional().describe("How much to swap, in the asset's units (e.g. 25 for 25 USDC)."),
        note: z.string().optional().describe("A note handle (gloam_list_notes): quote swapping its whole value."),
      },
    },
    async ({ network, from, to, amount, note }) => {
      const net = networkByKey(network);
      if (!swapRouterFor(net.chainId)) return text(notLive(net));
      const client = ctx.client(net);
      let amountWei: bigint | null = null;
      let fromInput = from;
      if (note) {
        const opened = ctx.openStore();
        if (!opened.ok) return text({ status: "error", error: opened.error });
        const n = opened.store.get(note);
        if (!n) return text({ status: "error", error: `There is no note "${note}". Call gloam_list_notes.` });
        if (n.chainId !== net.chainId) return text({ status: "error", error: `Note ${n.handle} is on ${n.network}, not ${net.key}.` });
        amountWei = BigInt(n.amountWei);
        fromInput = n.asset;
      }
      if (!fromInput) return text({ status: "error", error: "Name what you pay (from), or a note handle." });
      const [inRef, outRef] = await Promise.all([resolveAsset(net, client, fromInput), resolveAsset(net, client, to)]);
      if ("error" in inRef) return text({ status: "error", error: inRef.error });
      if ("error" in outRef) return text({ status: "error", error: outRef.error });
      if (amountWei === null) {
        if (amount === undefined) return text({ status: "error", error: "Name an amount, or a note handle." });
        if (inRef.decimals == null) return text({ status: "error", error: `The decimals of ${inRef.symbol} could not be read. Try again.` });
        amountWei = parseUnits(String(amount), inRef.decimals);
      }
      try {
        const q = await quoteSwap({
          client,
          chainId: net.chainId,
          pool: net.pool,
          assetIn: inRef.address,
          assetOut: outRef.address,
          amountIn: amountWei,
          relayStatus: await relayFor(ctx, net.chainId),
        });
        return text({ ...quoteView(net, q, inRef, outRef), execute: "gloam_execute_private_swap({ network, from, to, amount }) proves it here and sends it through the Gloam relay." });
      } catch (e) {
        return text({ ...refusedView(e, errMsg), network: net.key });
      }
    }
  );

  server.registerTool(
    "gloam_execute_private_swap",
    {
      title: "Execute a private swap",
      description:
        "REAL execution. Swap one note's value from one asset into another, privately: proves locally (the swapped note's unshield to a one-time escrow, the new note, and a refund note) and sends it through the Gloam relay, never from this server's wallet. Who swapped stays private; the tokens and the amounts are public. A swap spends one whole note: with an amount below a note's value, the note is first split with a private send to this server's own notes. Checked first against the owner's spending limits (\"swap\" must be listed in the agent's tools) and everything gloam_swap_quote checks. Both new notes are kept before anything is sent; gloam_finish_swap brings back a swap whose money waits at its escrow.",
      inputSchema: {
        network: ctx.networkArg("Which network to swap on:"),
        from: z.string().optional().describe('What you pay: a symbol or a 0x token address. Left out with a note handle: the note\'s asset.'),
        to: z.string().describe("What you receive: a symbol or a 0x token address."),
        amount: z.number().positive().optional().describe("How much to swap, in the asset's units. Left out with a note handle: its whole value."),
        note: z.string().optional().describe("The note handle to swap from (gloam_list_notes). Left out: an exact match, else the smallest note that covers the amount."),
      },
    },
    async ({ network, from, to, amount, note }) => {
      const net = networkByKey(network);
      if (!swapRouterFor(net.chainId)) return text(notLive(net));
      const client = ctx.client(net);
      const opened = ctx.openStore();
      if (!opened.ok) return text({ status: "error", error: opened.error });
      const store = opened.store;

      // what is paid and received
      let chosen: StoredNote | undefined;
      if (note) {
        chosen = store.get(note);
        if (!chosen) return text({ status: "error", error: `There is no note "${note}". Call gloam_list_notes.` });
        if (chosen.status !== "unspent") return text({ status: "error", error: `Note ${chosen.handle} is ${chosen.status}, not spendable.` });
        if (chosen.chainId !== net.chainId || !same(chosen.pool, net.pool)) return text({ status: "error", error: `Note ${chosen.handle} is on ${chosen.network}, not ${net.key}.` });
      }
      const fromInput = chosen?.asset ?? from;
      if (!fromInput) return text({ status: "error", error: "Name what you pay (from), or a note handle." });
      const [inRef, outRef] = await Promise.all([resolveAsset(net, client, fromInput), resolveAsset(net, client, to)]);
      if ("error" in inRef) return text({ status: "error", error: inRef.error });
      if ("error" in outRef) return text({ status: "error", error: outRef.error });
      if (chosen && from && !same((await resolveAsset(net, client, from).then((r) => ("error" in r ? null : r.address))) ?? "", chosen.asset)) {
        return text({ status: "error", error: `Note ${chosen.handle} holds ${chosen.symbol}, not ${from}.` });
      }
      let amountIn: bigint;
      if (amount !== undefined) {
        if (inRef.decimals == null) return text({ status: "error", error: `The decimals of ${inRef.symbol} could not be read. Try again.` });
        amountIn = parseUnits(String(amount), inRef.decimals);
      } else if (chosen) amountIn = BigInt(chosen.amountWei);
      else return text({ status: "error", error: "Name an amount, or a note handle." });
      if (amountIn <= 0n) return text({ status: "error", error: "The amount must be above zero." });

      // A note the chain reads as spent (a send of it landed after all) is never picked.
      const spentOnChain = async (n: StoredNote) => {
        const spent = await client
          .readContract({ address: net.pool, abi: POOL_READS, functionName: "isSpent", args: [n.nullifier] })
          .catch(() => false);
        if (spent) tryStore(() => void store.update(n.handle, { status: "spent", recheck: false }));
        return spent;
      };
      const fits = (n: StoredNote, need: bigint) =>
        n.chainId === net.chainId && same(n.pool, net.pool) && same(n.asset, inRef.address) && BigInt(n.amountWei) >= need && n.origin !== "payment";
      if (chosen) {
        if (!same(chosen.asset, inRef.address)) return text({ status: "error", error: `Note ${chosen.handle} holds ${chosen.symbol}, not ${inRef.symbol}.` });
        if (BigInt(chosen.amountWei) < amountIn) return text({ status: "error", error: `Note ${chosen.handle} holds ${units(BigInt(chosen.amountWei), inRef)}, less than ${units(amountIn, inRef)}.` });
        if (await spentOnChain(chosen)) return text({ status: "error", error: `Note ${chosen.handle} is already spent on chain. It is marked spent; call gloam_list_notes with refresh.` });
      } else {
        const candidates = store
          .list()
          .filter((n) => n.status === "unspent" && fits(n, amountIn))
          .sort((a, b) => (BigInt(a.amountWei) === amountIn ? -1 : BigInt(b.amountWei) === amountIn ? 1 : BigInt(a.amountWei) < BigInt(b.amountWei) ? -1 : 1));
        for (const c of candidates) {
          if (!(await spentOnChain(c))) {
            chosen = c;
            break;
          }
        }
        if (!chosen) {
          return text({
            status: "error",
            error: `No single private note on ${describeNetwork(net)} holds ${units(amountIn, inRef)}. A swap spends one note; notes are not combined.`,
          });
        }
      }
      const split = BigInt(chosen.amountWei) > amountIn;

      // The quote and its stops, before anything is reserved or proved.
      const relayState = await relayFor(ctx, net.chainId);
      let quote: SwapQuote;
      try {
        quote = await quoteSwap({ client, chainId: net.chainId, pool: net.pool, assetIn: inRef.address, assetOut: outRef.address, amountIn, relayStatus: relayState });
      } catch (e) {
        return text({ ...refusedView(e, errMsg), network: net.key });
      }
      if (quote.stop) return text({ ...quoteView(net, quote, inRef, outRef), status: "refused" });

      // The owner's limits: on the value the swap spends.
      const spend: Spend & { pool: Address } = {
        tool: "swap",
        network: net.key,
        chainId: net.chainId,
        asset: inRef.address,
        amountWei: amountIn,
        recipient: null,
        pool: net.pool,
      };
      const gate = authorizeSpend(spend, env);
      if (!gate.ok) return text(gate.refusal);
      const url = swapRelayUrl(env);

      // A larger note is split first: the part to swap and the change, both this server's own.
      let input: StoredNote = chosen;
      if (split) {
        const r = await splitNote(ctx, store, net, chosen, amountIn, inRef, url);
        if (!r.ok) {
          settleSpend(gate, r.maybeSent ? "unconfirmed" : "failed", { reason: String(r.result.error ?? r.result.message ?? "split failed") });
          return text(r.result);
        }
        input = r.exact;
      }

      try {
        store.reserveForSpend(input.handle, (n) => (fits(n, amountIn) && BigInt(n.amountWei) === amountIn ? null : `Note ${n.handle} no longer matches this swap.`));
      } catch (e) {
        settleSpend(gate, "failed", { reason: errMsg(e) });
        return text({ status: "error", error: errMsg(e) });
      }
      const release = () => tryStore(() => void store.update(input.handle, { status: "unspent" }));

      // Prove: everything the relay will check, then the three proofs. Nothing is sent here.
      let built: Awaited<ReturnType<typeof buildSwapIntent>>;
      try {
        const synced = await ctx.syncTree(client, { pool: net.pool, fromBlock: net.deployBlock });
        const commitment = fieldToHex(await noteCommitmentPoseidon(hexToField(input.secret), amountIn, inRef.address)) as Hex;
        const path = await synced.pathForCommitment(commitment);
        if (!path) throw new Error(`Note ${input.handle} is not in the vault's tree yet. Wait for it to confirm.`);
        const [shieldProver, unshieldProver] = await Promise.all([ctx.shieldProver(net), ctx.unshieldProver(net)]);
        built = await buildSwapIntent({
          client,
          chainId: net.chainId,
          pool: net.pool,
          note: { secretHex: input.secret, amountWei: amountIn, asset: inRef.address },
          path,
          assetOut: outRef.address,
          quote,
          shieldProver,
          unshieldProver,
          relayStatus: relayState,
        });
      } catch (e) {
        release();
        settleSpend(gate, "failed", { reason: errMsg(e) });
        return text({ ...refusedView(e, errMsg), network: net.key, ...(split ? { split: `The note was split first: ${input.handle} holds the amount, spendable again.` } : {}) });
      }

      // Both new notes are kept before anything is sent.
      let refund: StoredNote;
      let out: StoredNote;
      try {
        refund = store.add({
          network: net.key,
          chainId: net.chainId,
          pool: net.pool,
          asset: inRef.address,
          symbol: inRef.symbol,
          decimals: inRef.decimals ?? 18,
          amountWei: built.recovery.refund.amountWei,
          secret: built.recovery.refund.secret,
          commitment: built.recovery.refund.commitment,
          nullifier: built.recovery.refund.nullifier,
          status: "pending",
          pending: "create",
          origin: "swap_refund",
          createdTx: null,
          swap: built.recovery,
          label: `refund note of a swap of ${units(amountIn, inRef)} into ${outRef.symbol}`,
        });
        out = store.add({
          network: net.key,
          chainId: net.chainId,
          pool: net.pool,
          asset: outRef.address,
          symbol: outRef.symbol,
          decimals: outRef.decimals ?? 18,
          amountWei: built.recovery.out.amountWei,
          secret: built.recovery.out.secret,
          commitment: built.recovery.out.commitment,
          nullifier: built.recovery.out.nullifier,
          status: "pending",
          pending: "create",
          origin: "swap",
          createdTx: null,
          swapPair: refund.handle,
          label: `from a swap of ${units(amountIn, inRef)}`,
        });
      } catch (e) {
        // nothing was sent and nobody saw the proofs: the note goes back as it was
        release();
        settleSpend(gate, "failed", { reason: errMsg(e) });
        return text({ status: "error", error: `The swap's notes could not be kept, so nothing was sent: ${errMsg(e)}` });
      }

      let hash: Hex;
      try {
        assertSwapSendable(built.relay);
        hash = await ctx.relaySwap(built.relay, { url });
      } catch (e) {
        if (e instanceof SwapRefusedError) {
          // refused before the relay saw anything
          tryStore(() => store.remove(out.handle));
          tryStore(() => store.remove(refund.handle));
          release();
          settleSpend(gate, "failed", { reason: e.message });
          return text(refusedView(e, errMsg));
        }
        const maybeSent = !(e instanceof GloamRelayError) || RELAY_MAYBE_SENT.has(e.code);
        if (maybeSent) {
          settleSpend(gate, "unconfirmed", { reason: errMsg(e) });
          return text({
            status: "error",
            error: errMsg(e),
            check: "The swap may have gone out and may still land. Call gloam_list_notes with refresh: it settles the swap's notes from the chain. Do not swap this note again first.",
            swap: refund.handle,
          });
        }
        // The relay refused it, but it has seen the proofs, and the unshield proof stays valid
        // until the note is spent: both new notes stay kept (dead), the note is spendable again.
        tryStore(() => void store.markDead(out.handle));
        tryStore(() => void store.markDead(refund.handle));
        tryStore(() => void store.update(input.handle, { status: "unspent", recheck: true }));
        settleSpend(gate, "failed", { reason: errMsg(e) });
        return text({
          status: "refused",
          code: (e as GloamRelayError).code,
          message: errMsg(e),
          note: `Nothing was swapped. ${input.handle} is spendable again; the swap's notes are kept, in case its proof is ever sent.`,
        });
      }

      // Out: what landed decides each note. Anything unread stays pending for a refresh.
      const sentAt = Date.now();
      const rec = { ...built.recovery, info: { ...built.recovery.info, sent: { hash, at: sentAt } } };
      tryStore(() => void store.update(refund.handle, { swap: rec, createdTx: hash }));
      tryStore(() => void store.update(out.handle, { createdTx: hash }));
      tryStore(() => void store.update(input.handle, { spentTx: hash }));
      let receipt: "success" | "reverted" | "unknown" = "unknown";
      try {
        receipt = (await client.waitForTransactionReceipt({ hash })).status;
      } catch {
        // a slow network: the refresh reads it later
      }
      const outcome = await readSwapOutcome(client, rec).catch(() => null);
      const fresh = store.get(refund.handle) ?? refund;
      const said = outcome ? applySwapOutcome(store, fresh, outcome, tryStore) : "not read yet";
      const landed = outcome && ["swapped", "refunded", "refund_ready", "exit_ready", "closed"].includes(outcome.state);
      const logWarning = settleSpend(gate, landed ? "sent" : outcome?.state === "reverted" || receipt === "reverted" ? "reverted" : "unconfirmed", { hash });
      const now = (h: string) => {
        const n = store.get(h);
        return n ? noteView(n) : null;
      };
      return text({
        status: outcome?.state === "swapped" ? "swapped" : outcome?.state === "refunded" ? "refunded" : (outcome?.state ?? "sent"),
        ...(logWarning ? { logWarning } : {}),
        network: net.key,
        ...(net.testnet ? {} : { realMoney: true }),
        submittedBy: "gloam-relay (this server's wallet is not in it)",
        hash,
        explorer: `${net.explorer}/tx/${hash}`,
        paid: units(amountIn, inRef),
        receive: units(BigInt(built.recovery.out.amountWei), outRef),
        outcome: said,
        notes: { swapped: input.handle, newNote: now(out.handle), refundNote: now(refund.handle), ...(split ? { splitFrom: chosen.handle } : {}) },
        warnings: built.warnings,
        privacy: SWAP_PRIVACY,
      });
    }
  );

  server.registerTool(
    "gloam_finish_swap",
    {
      title: "Finish a private swap",
      description:
        "Settle a swap this server made, by its refund note's handle (or its new note's): reads how it ended and does what is needed. When the swapped note's money waits at the swap's escrow, it brings it back as the refund note through the relay; when the refund note can't take it (the vault's fee rose, or the vault is full on routers with an exit), it sends it to a `to` address you give, which is public and goes through the owner's limits like any spend.",
      inputSchema: {
        note: z.string().describe("The swap's refund note handle (gloam_list_notes shows it), or its new note's."),
        to: z.string().optional().describe("Only for an exit: the 0x address the waiting money goes to. Public."),
      },
    },
    async ({ note, to }) => {
      const opened = ctx.openStore();
      if (!opened.ok) return text({ status: "error", error: opened.error });
      const store = opened.store;
      let refund = store.get(note);
      if (refund?.origin === "swap" && refund.swapPair) refund = store.get(refund.swapPair);
      if (!refund?.swap) return text({ status: "error", error: `"${note}" is not a swap's note. Call gloam_list_notes.` });
      const net = networkByChainId(refund.chainId);
      if (!net) return text({ status: "error", error: `This server has no network for chain ${refund.chainId}.` });
      const client = ctx.client(net);
      const rec = refund.swap;
      let outcome: SwapOutcome;
      try {
        outcome = await readSwapOutcome(client, rec);
      } catch (e) {
        return text({ status: "error", error: `Could not read the swap: ${errMsg(e)}` });
      }
      const url = swapRelayUrl(env);
      const inRef = await describeAsset(net, client, rec.info.assetIn);

      if (outcome.state === "refund_ready") {
        try {
          const call = await buildSwapRefund(rec, { client, shieldProver: await ctx.shieldProver(net) });
          tryStore(() => void store.update(refund!.handle, { swap: rec }));
          const hash = await ctx.relaySwap(call.relay, { url });
          await client.waitForTransactionReceipt({ hash }).catch(() => null);
          const after = await readSwapOutcome(client, rec).catch(() => null);
          const said = after ? applySwapOutcome(store, store.get(refund.handle)!, after, tryStore) : "sent; call gloam_list_notes with refresh";
          return text({ status: after?.state === "refunded" ? "refunded" : "sent", hash, explorer: `${net.explorer}/tx/${hash}`, outcome: said, refundNote: noteView(store.get(refund.handle)!) });
        } catch (e) {
          return text({ ...refusedView(e, errMsg), note: refund.handle, check: "The money still waits at the swap's escrow. Try again shortly." });
        }
      }

      if (outcome.state === "exit_ready") {
        if (!to || !isAddress(to, { strict: false })) {
          return text({
            status: "needs_to",
            note: refund.handle,
            waiting: units(outcome.held, inRef),
            message: "The refund note can't take this money back. Name a 0x address (to) to send it to; it is public, and goes through the owner's limits.",
          });
        }
        const spend: Spend & { pool: Address } = {
          tool: "swap",
          network: net.key,
          chainId: net.chainId,
          asset: rec.info.assetIn,
          amountWei: outcome.held,
          recipient: to,
          pool: net.pool,
        };
        const gate = authorizeSpend(spend, env);
        if (!gate.ok) return text(gate.refusal);
        try {
          const call = await buildSwapExit(rec, { client, to: getAddress(to) });
          const hash = await ctx.relaySwap(call.relay, { url });
          const receipt = await client.waitForTransactionReceipt({ hash }).catch(() => null);
          if (receipt?.status === "success") {
            tryStore(() => void store.update(refund!.handle, { status: "spent", recheck: false }));
            const { out, input } = swapNotes(store, refund!);
            if (out && out.status !== "spent") tryStore(() => void store.markDead(out.handle));
            if (input && input.status !== "spent") tryStore(() => void store.update(input.handle, { status: "spent" }));
          }
          const logWarning = settleSpend(gate, receipt?.status === "success" ? "sent" : receipt?.status === "reverted" ? "reverted" : "unconfirmed", { hash });
          return text({
            status: receipt?.status === "success" ? "exited" : receipt?.status === "reverted" ? "reverted" : "sent",
            ...(logWarning ? { logWarning } : {}),
            hash,
            explorer: `${net.explorer}/tx/${hash}`,
            paid: { amount: units(outcome.held, inRef), to: getAddress(to) },
            privacy: "An exit is public: the amount and the address show on chain.",
          });
        } catch (e) {
          const maybeSent = !(e instanceof SwapRefusedError) && (!(e instanceof GloamRelayError) || RELAY_MAYBE_SENT.has(e.code));
          settleSpend(gate, maybeSent ? "unconfirmed" : "failed", { reason: errMsg(e) });
          return text({ ...refusedView(e, errMsg), note: refund.handle });
        }
      }

      const said = applySwapOutcome(store, refund, outcome, tryStore);
      return text({
        status: outcome.state,
        note: refund.handle,
        outcome: said,
        ...(outcome.state === "pending" ? { deadline: outcome.deadline === null ? null : new Date(Number(outcome.deadline) * 1000).toISOString() } : {}),
      });
    }
  );
}

const POOL_READS = [
  { type: "function", name: "isSpent", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
] as const;

type SplitResult = { ok: true; exact: StoredNote } | { ok: false; maybeSent: boolean; result: Record<string, unknown> };

/**
 * Splits `note` into a note of exactly `amount` and the change, both this server's own,
 * with a private send through the relay, and waits for it. Both new notes are kept
 * before the send, the way a payment's are.
 */
async function splitNote(
  ctx: SwapToolContext,
  store: NoteStore,
  net: McpNetwork,
  note: StoredNote,
  amount: bigint,
  asset: AssetRef,
  url: string
): Promise<SplitResult> {
  const { tryStore, errMsg } = ctx;
  const client = ctx.client(net);
  const fail = (result: Record<string, unknown>, maybeSent = false): SplitResult => ({ ok: false, maybeSent, result });
  try {
    store.reserveForSpend(note.handle, (n) => (n.chainId === net.chainId && same(n.asset, note.asset) && BigInt(n.amountWei) > amount ? null : `Note ${n.handle} no longer covers this swap.`));
  } catch (e) {
    return fail({ status: "error", error: errMsg(e) });
  }
  const release = () => tryStore(() => void store.update(note.handle, { status: "unspent" }));
  let exact: StoredNote | undefined;
  let change: StoredNote | undefined;
  let hash: Hex | undefined;
  let sending = false;
  try {
    const value = BigInt(note.amountWei);
    const commitment = fieldToHex(await noteCommitmentPoseidon(hexToField(note.secret), value, note.asset)) as Hex;
    const synced = await ctx.syncTree(client, { pool: net.pool, fromBlock: net.deployBlock });
    const path = await synced.pathForCommitment(commitment);
    if (!path) {
      release();
      return fail({ status: "error", error: `Note ${note.handle} is not in the vault's tree yet. Wait for it to confirm.` });
    }
    const intent = await buildPrivateSendIntent({
      secretHex: note.secret,
      amountInWei: value,
      amountPayWei: amount,
      asset: note.asset,
      path,
      prove: await ctx.transferProver(net),
      chainId: net.chainId,
      poolAddress: net.pool,
    });
    const keep = (n: { secret: Hex; commitment: Hex; nullifier: Hex; amountWei: string }, label: string) =>
      store.add({
        network: net.key,
        chainId: net.chainId,
        pool: net.pool,
        asset: note.asset,
        symbol: note.symbol,
        decimals: note.decimals,
        amountWei: n.amountWei,
        secret: n.secret,
        commitment: n.commitment,
        nullifier: n.nullifier,
        status: "pending",
        pending: "create",
        origin: "change",
        createdTx: null,
        label,
      });
    exact = keep(intent.paymentNote, `set aside for a swap of ${units(amount, asset)}`);
    if (BigInt(intent.changeNote.amountWei) > 0n) change = keep(intent.changeNote, `change from setting aside a swap`);
    sending = true;
    hash = await ctx.relay(intent, { url });
    const sentHash = hash;
    tryStore(() => void store.update(note.handle, { spentTx: sentHash }));
    tryStore(() => void store.update(exact!.handle, { createdTx: sentHash }));
    if (change) tryStore(() => void store.update(change!.handle, { createdTx: sentHash }));
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      const spentElsewhere = await client
        .readContract({ address: net.pool, abi: POOL_READS, functionName: "isSpent", args: [note.nullifier] })
        .catch(() => null);
      if (spentElsewhere === false) {
        tryStore(() => void store.markDead(exact!.handle));
        if (change) tryStore(() => void store.markDead(change!.handle));
        tryStore(() => void store.update(note.handle, { status: "unspent", recheck: true }));
        return fail({ status: "error", error: `Setting the swap's amount aside reverted (${hash}). Nothing moved; the note is spendable again.` });
      }
      return fail({ status: "error", error: `Setting the swap's amount aside reverted (${hash}). Call gloam_list_notes with refresh before trying again.`, hash }, true);
    }
    tryStore(() => void store.update(note.handle, { status: "spent", spentTx: sentHash }));
    tryStore(() => void store.update(exact!.handle, { status: "unspent", createdTx: sentHash }));
    if (change) tryStore(() => void store.update(change!.handle, { status: "unspent", createdTx: sentHash }));
    return { ok: true, exact: store.get(exact.handle)! };
  } catch (e) {
    const maybeSent = Boolean(hash) || (sending && (!(e instanceof GloamRelayError) || RELAY_MAYBE_SENT.has(e.code)));
    if (!maybeSent) {
      release();
      if (exact) tryStore(() => store.remove(exact!.handle));
      if (change) tryStore(() => store.remove(change!.handle));
    }
    return fail(
      {
        status: "error",
        error: `Setting the swap's amount aside failed: ${errMsg(e)}`,
        ...(maybeSent ? { ...(hash ? { hash } : {}), check: "It may have gone out. Call gloam_list_notes with refresh before trying again." } : {}),
      },
      maybeSent
    );
  }
}
