/**
 * The RPC the server uses for a chain. Server reads and relay sends all leave
 * from Vercel's shared IPs, so under load a chain's public RPC starts answering
 * 429. Set GLOAM_RPC_URL_<chainId> (server env only, never NEXT_PUBLIC_) to a
 * private endpoint and the server uses it first, with the public RPC behind it.
 * Without it, the public RPC alone, as before.
 *
 * A private RPC is used only once it answers eth_chainId with its own chain.
 * The vault has the same address on every chain, so a node for another chain
 * (a Base Sepolia URL pasted under Base mainnet's id, say) would answer every
 * vault read with that chain's state, and the answers would look real. One
 * that answers for another chain is never used: reads go to the public RPC,
 * and a send is refused before it reaches any node (WrongChainRpcError). One
 * that has not answered yet (down, slow, timed out) is passed over for a
 * while: reads and the relay's send go to the public RPC instead, so a private
 * RPC that is down never takes the server or the relay down with it.
 */
import { fallback, http, type HttpTransportConfig, type Transport } from "viem";
import type { GloamNetwork } from "./networks";

type Net = Pick<GloamNetwork, "chainId" | "chain">;

/** The calls that put a signed transaction out. */
const SEND_METHODS = ["eth_sendRawTransaction", "eth_sendRawTransactionSync"];

function privateRpc(net: Net): string | null {
  return process.env[`GLOAM_RPC_URL_${net.chainId}`]?.trim() || null;
}

/** The private RPC set for this chain answers for another chain. Nothing was sent. */
export class WrongChainRpcError extends Error {
  constructor(readonly chainId: number) {
    super(`The private RPC set for chain ${chainId} answers for another chain, so it is not used.`);
    this.name = "WrongChainRpcError";
  }
}

/**
 * The private RPC set for this chain has not said which chain it serves yet
 * (down, slow, timed out), so this call goes to the public RPC. Nothing was
 * sent to it. Not a WrongChainRpcError: the relay never reads it as "off".
 */
export class UncheckedRpcError extends Error {
  constructor(readonly chainId: number) {
    super(`The private RPC set for chain ${chainId} has not said which chain it serves yet, so it is not used.`);
    this.name = "UncheckedRpcError";
  }
}

/** The longest the chain id check waits. A healthy node answers eth_chainId from memory. */
const CHECK_TIMEOUT_MS = 5_000;
/** After a check with no answer, the private RPC is passed over this long before it is asked again. */
const RECHECK_AFTER_MS = 30_000;

/** Chain id checks, per chain and URL: true or false once answered. */
const checks = new Map<string, Promise<boolean | null>>();
/** Per chain and URL: until when a private RPC that did not answer is passed over. */
const quietUntil = new Map<string, number>();

/** Test hook: forget every check, as a new instance would. */
export function resetRpcChecks(): void {
  checks.clear();
  quietUntil.clear();
}

/**
 * Whether `url` answers eth_chainId with `chainId`. Null when it did not
 * answer (down, timed out): it is then passed over for RECHECK_AFTER_MS, so a
 * hung node costs one short wait per instance, not one per call. Logs a
 * mismatch once and a missed check each time, never the URL (it can carry
 * its key).
 */
function answersFor(url: string, chainId: number, config: HttpTransportConfig): Promise<boolean | null> {
  const key = `${chainId} ${url}`;
  const known = checks.get(key);
  if (known) return known;
  if ((quietUntil.get(key) ?? 0) > Date.now()) return Promise.resolve(null);
  const timeout = Math.min(config.timeout ?? CHECK_TIMEOUT_MS, CHECK_TIMEOUT_MS);
  const check = http(url, { ...config, timeout, retryCount: 0 })({})
    .request({ method: "eth_chainId" })
    .then((id) => {
      const ok = Number(id) === chainId;
      if (!ok) console.error("gloam_rpc_wrong_chain", JSON.stringify({ chainId, answered: Number(id) }));
      return ok;
    })
    .catch((e: unknown) => {
      checks.delete(key);
      quietUntil.set(key, Date.now() + RECHECK_AFTER_MS);
      const status = (e as { status?: number })?.status ?? null;
      console.warn("gloam_rpc_unchecked", JSON.stringify({ chainId, error: e instanceof Error ? e.name : "error", status }));
      return null;
    });
  checks.set(key, check);
  return check;
}

/**
 * The private RPC, behind the chain id check. `sendInstead` (the relay's
 * transport only) takes a send while the private RPC has not answered: nothing
 * reached it, so the send still goes out once, through the public RPC.
 */
function checkedPrivate(url: string, chainId: number, config: HttpTransportConfig, sendInstead?: Transport): Transport {
  const inner = http(url, config);
  return (params) => {
    const t = inner(params);
    return {
      ...t,
      async request(args) {
        const answered = await answersFor(url, chainId, config);
        if (answered === false) throw new WrongChainRpcError(chainId);
        if (answered === null) {
          if (sendInstead && SEND_METHODS.includes(args.method)) return sendInstead(params).request(args);
          // reads: the fallback moves on to the public RPC
          throw new UncheckedRpcError(chainId);
        }
        return t.request(args);
      },
    } as typeof t;
  };
}

/**
 * `sendOnce` is for the relay's sends: a signed transaction goes to one RPC
 * only. The public backup still answers reads, but never gets a raw send the
 * private RPC may already have taken, since a second copy could only revert or
 * come back as a nonce clash that looks like nothing went out. The fallback
 * also takes `retryCount` from `config` then, instead of its own default of 3.
 */
export function serverTransport(net: Net, config: HttpTransportConfig = {}, opts: { sendOnce?: boolean } = {}): Transport {
  const pub = net.chain.rpcUrls.default.http[0]!;
  const priv = privateRpc(net);
  if (!priv || priv === pub) return http(pub, config);
  if (!opts.sendOnce) return fallback([checkedPrivate(priv, net.chainId, config), http(pub, config)]);
  const own = checkedPrivate(priv, net.chainId, config, http(pub, { ...config, retryCount: 0 }));
  const backup = http(pub, { ...config, methods: { exclude: SEND_METHODS } });
  return fallback([own, backup], { retryCount: config.retryCount });
}
