"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignTypedData } from "wagmi";
import { WALLETCONNECT_ID, WALLETCONNECT_ENABLED, prefersWalletConnect } from "@/lib/walletConnect";
import { formatGloam, formatUtc, percentOf, shortAddress, voteMessage, voteTypedData, type Ballot } from "@/lib/vote/core";
import type { VoteConfig } from "@/lib/vote/config";
import type { VoteSummary, VoterStanding } from "@/lib/vote/results";

const WalletConnectSheet = dynamic(() => import("@/components/app/WalletConnectSheet").then((m) => m.WalletConnectSheet), { ssr: false });

const POLL_MS = 10_000;
const LIST_PAGE = 25;

type Props = { initial: VoteSummary };

function statusLine(s: VoteSummary): string {
  if (s.draft) return "Draft, not published";
  if (s.status === "upcoming") return `Opens ${formatUtc(s.start)}`;
  if (s.status === "open") return `Open until ${formatUtc(s.end)}`;
  return `Closed ${formatUtc(s.end)}`;
}

/** The vote as the config has it, rebuilt from the summary for signing. */
function asConfig(s: VoteSummary): VoteConfig {
  return {
    id: s.id,
    published: !s.draft,
    question: s.question,
    description: s.description,
    options: s.options,
    snapshotBlock: s.snapshotBlock,
    start: s.start,
    end: s.end,
  };
}

function Check({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VoteClient({ initial }: Props) {
  const [summary, setSummary] = useState<VoteSummary>(initial);
  const [ballots, setBallots] = useState<Ballot[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [standing, setStanding] = useState<VoterStanding | null>(null);
  const [standingFor, setStandingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wcOpen, setWcOpen] = useState(false);
  const [env, setEnv] = useState<{ mounted: boolean; wc: boolean; wallet: boolean }>({ mounted: false, wc: false, wallet: false });

  const { address, isConnected, status } = useAccount();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- which wallets this browser has is known only after mount
    setEnv({
      mounted: true,
      wc: prefersWalletConnect(),
      wallet: typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum),
    });
    return () => {
      live.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        fetch(`/api/vote/${summary.id}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/vote/${summary.id}/ballots`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!live.current) return;
      if (s?.ok) setSummary(s.data as VoteSummary);
      if (Array.isArray(b?.ballots)) setBallots(b.ballots as Ballot[]);
    } catch {
      /* the last totals stay up; the next poll tries again */
    }
  }, [summary.id]);

  // totals and the list, then every few seconds while the tab is open and the vote can change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set only once the network answers
    void refresh();
    if (summary.status !== "open" && !summary.draft) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [refresh, summary.status, summary.draft]);

  // the connected wallet's weight and its vote so far
  useEffect(() => {
    if (!address || !summary.snapshotReady) return;
    let stop = false;
    fetch(`/api/vote/${summary.id}?address=${address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (stop || !j?.ok || !j.data.you) return;
        const you = j.data.you as VoterStanding;
        setStanding(you);
        setStandingFor(address);
        if (you.ballot) setPicked((p) => (p === null ? you.ballot!.option : p));
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [address, summary.id, summary.snapshotReady]);

  const you = standing && standingFor === address ? standing : null;
  const injectedConnector = connectors.find((c) => c.id !== WALLETCONNECT_ID);

  function openWallet() {
    setError(null);
    if (env.wc) setWcOpen(true);
    else if (injectedConnector && env.wallet) connect({ connector: injectedConnector });
  }

  async function sign() {
    if (!address || picked === null || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = voteMessage(asConfig(summary), picked, address, timestamp);
      const signature = await signTypedDataAsync({ ...voteTypedData(message), account: address });
      const res = await fetch(`/api/vote/${summary.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voter: address, option: picked, timestamp, signature }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok: true; data: { ballot: Ballot; changed: boolean } }
        | { ok: false; error: { message: string } }
        | null;
      if (!j?.ok) {
        setError(j?.error.message ?? "We couldn't save that vote. Try again.");
        return;
      }
      setNotice(j.data.changed ? "Your vote is changed." : "Your vote is in.");
      setStanding((s) => (s ? { ...s, ballot: j.data.ballot } : s));
      void refresh();
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(name === "UserRejectedRequestError" ? "You didn't sign, so nothing was sent." : "Your wallet couldn't sign that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const s = summary;
  const total = BigInt(s.totals.weight);
  const accepting = s.accepting;
  const myBallot = you?.ballot ?? null;
  const canVote = accepting && you !== null && !you.excluded && BigInt(you.weight) > 0n;
  const list = ballots ? [...ballots].sort((a, b) => (BigInt(b.weight) > BigInt(a.weight) ? 1 : BigInt(b.weight) < BigInt(a.weight) ? -1 : 0)) : null;
  const shown = list ? (showAll ? list : list.slice(0, LIST_PAGE)) : null;

  return (
    <>
      {/* the question */}
      <section className="mx-auto max-w-[760px] px-5 pt-12 sm:px-7 sm:pt-20">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-mute">
          <Link href="/vote" className="transition-colors hover:text-foreground">
            Holder vote
          </Link>
          <span aria-hidden className="h-1 w-1 rounded-full bg-faint" />
          <span className={s.draft ? "text-warn" : undefined}>{statusLine(s)}</span>
        </p>
        <h1 className="t-display-l mt-5 [text-wrap:balance]">{s.question}</h1>
        {s.description && <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-soft sm:text-[17px]">{s.description}</p>}
      </section>

      {/* the options, with the live totals */}
      <section className="mx-auto max-w-[760px] px-5 pt-10 sm:px-7" aria-labelledby="options-title">
        <h2 id="options-title" className="sr-only">
          Options
        </h2>
        <div role="radiogroup" aria-label="Options" className="flex flex-col gap-2.5">
          {s.totals.options.map((o) => {
            const on = picked === o.option;
            const mine = myBallot?.option === o.option;
            const share = percentOf(BigInt(o.weight), total);
            return (
              <button
                key={o.option}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canVote || busy}
                onClick={() => {
                  setPicked(o.option);
                  setNotice(null);
                }}
                className={`relative w-full overflow-hidden rounded-[12px] border px-4 py-4 text-left transition-colors sm:px-5 ${
                  on ? "border-foreground bg-panel" : "border-line bg-panel"
                } ${canVote ? "hover:border-line-strong" : "cursor-default"} disabled:opacity-100`}
              >
                <span className="relative flex items-center gap-3.5">
                  <span
                    aria-hidden
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      on ? "border-foreground bg-foreground text-panel" : "border-line-strong"
                    } ${canVote ? "" : "opacity-0 max-sm:hidden"}`}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-panel" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] leading-snug text-foreground sm:text-[17px]">{o.label}</span>
                    {mine && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[13px] text-mute">
                        <Check size={12} /> Your vote
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block text-[16px] text-foreground">{share}%</span>
                    <span className="tnum block text-[12.5px] text-mute">
                      {o.wallets} {o.wallets === 1 ? "wallet" : "wallets"}
                    </span>
                  </span>
                </span>
                {/* the share, as a hairline along the foot of the row */}
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2">
                  <span className="block h-full bg-foreground/70 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${share}%` }} />
                </span>
              </button>
            );
          })}
        </div>

        <p className="tnum mt-4 text-[13.5px] text-mute">
          {s.totals.wallets} {s.totals.wallets === 1 ? "wallet has" : "wallets have"} voted with {formatGloam(s.totals.weight)} GLOAM
          {s.eligible ? ` of ${formatGloam(s.eligible.weight)} that can vote` : ""}.
        </p>
      </section>

      {/* one action */}
      <section className="mx-auto max-w-[760px] px-5 pt-8 sm:px-7" aria-live="polite">
        <div className="gl-card p-5 sm:p-7">
          {!s.snapshotReady ? (
            <p className="text-[15px] leading-relaxed text-soft">The balance snapshot for this vote isn&apos;t taken yet, so it can&apos;t take votes.</p>
          ) : !accepting ? (
            <p className="text-[15px] leading-relaxed text-soft">
              {s.status === "closed" ? "Voting has closed. The totals above are final." : `Voting opens ${formatUtc(s.start)}.`}
            </p>
          ) : !env.mounted || status === "reconnecting" ? (
            <div className="h-12 w-48 rounded-full bg-surface" />
          ) : !isConnected || !address ? (
            <div>
              <p className="text-[15px] leading-relaxed text-soft">
                Connect the wallet that held $GLOAM at block {s.snapshotBlock.toLocaleString("en-US")}. Voting is a signature: no
                transaction and no gas.
              </p>
              {env.wc || (env.wallet && injectedConnector) ? (
                <button type="button" onClick={openWallet} disabled={connecting} className="btn btn-ink btn-lg mt-5 w-full sm:w-auto">
                  {connecting ? "Connecting…" : "Connect wallet"}
                </button>
              ) : (
                <p className="mt-4 text-[14px] leading-relaxed text-mute">
                  {WALLETCONNECT_ENABLED
                    ? "No wallet found here."
                    : "No wallet found here. Open this page in your wallet app's browser, or on a computer with a wallet extension."}
                </p>
              )}
              {connectError && <p className="mt-3 text-[13.5px] text-danger">Your wallet didn&apos;t connect. Try again.</p>}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="tnum text-[15px] text-foreground">{shortAddress(address)}</p>
                <button type="button" onClick={() => disconnect()} className="text-[13.5px] text-mute underline-offset-4 transition-colors hover:text-foreground hover:underline">
                  Disconnect
                </button>
              </div>
              {you === null ? (
                <div className="mt-3 h-5 w-56 rounded bg-surface" />
              ) : you.excluded ? (
                <p className="mt-3 text-[14.5px] leading-relaxed text-soft">This address doesn&apos;t vote. {you.excluded}.</p>
              ) : BigInt(you.weight) === 0n ? (
                <p className="mt-3 text-[14.5px] leading-relaxed text-soft">
                  This wallet held no $GLOAM at block {s.snapshotBlock.toLocaleString("en-US")}, so it has no vote here.
                </p>
              ) : (
                <>
                  <p className="tnum mt-3 text-[14.5px] leading-relaxed text-soft">
                    Your vote carries {formatGloam(you.weight)} GLOAM, your balance at block {s.snapshotBlock.toLocaleString("en-US")}.
                  </p>
                  <button
                    type="button"
                    onClick={sign}
                    disabled={picked === null || busy || myBallot?.option === picked}
                    className="btn btn-ink btn-lg mt-5 w-full sm:w-auto"
                  >
                    {busy
                      ? "Check your wallet…"
                      : picked === null
                        ? "Pick an option"
                        : myBallot?.option === picked
                          ? "Your vote is in"
                          : myBallot
                            ? `Change vote to ${s.options[picked]}`
                            : `Vote ${s.options[picked]}`}
                  </button>
                  {notice && (
                    <p className="mt-4 flex items-center gap-2 text-[14px] text-foreground">
                      <span className="text-sealed">
                        <Check />
                      </span>
                      {notice} You can change it until {formatUtc(s.end)}.
                    </p>
                  )}
                  {!notice && myBallot && (
                    <p className="mt-4 text-[13.5px] text-mute">
                      You voted {myBallot.choice}. You can change it until {formatUtc(s.end)}; your latest signature counts.
                    </p>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="mt-4 text-[14px] leading-relaxed text-danger">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 sm:pt-20" aria-labelledby="how-title">
        <h2 id="how-title" className="t-display-m">
          How this vote works
        </h2>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {[
            "This is an open vote. Every vote, with the wallet that cast it, is public below.",
            `Your weight is your public $GLOAM balance at Robinhood Chain block ${s.snapshotBlock ? s.snapshotBlock.toLocaleString("en-US") : "(not set yet)"}. Buying or moving GLOAM after it changes nothing.`,
            "Team wallets, Gloam's own contracts and the trading pools don't count. They are listed at the foot of this page.",
            "GLOAM held privately inside Gloam can't be counted in an open vote. Private voting, where you prove your balance without showing your wallet, is the next step on the roadmap.",
            "One wallet, one vote. You can change it until the vote closes; your latest signature counts.",
            "The result is advisory, and the team commits to act on it.",
          ].map((line) => (
            <li key={line} className="py-4 text-[15px] leading-relaxed text-soft">
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/* every vote */}
      <section className="mx-auto max-w-[760px] px-5 pt-16 sm:px-7 sm:pt-20" aria-labelledby="votes-title">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 id="votes-title" className="t-display-m">
            Every vote
          </h2>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
            <a href={`/api/vote/${s.id}/ballots?download=1`} className="gl-arrowlink">
              JSON <span aria-hidden>↓</span>
            </a>
            <a href={`/api/vote/${s.id}/ballots?format=csv`} className="gl-arrowlink">
              CSV <span aria-hidden>↓</span>
            </a>
          </div>
        </div>
        <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-mute">
          Each vote is an EIP-712 signature. The downloads carry every signature and the signed message format, so anyone can check
          each one and count again.
        </p>

        {list === null ? (
          <div className="mt-6 h-24 rounded-[12px] bg-surface" />
        ) : list.length === 0 ? (
          <p className="mt-6 rounded-[12px] border border-line px-4 py-6 text-[14.5px] text-mute">No votes yet.</p>
        ) : (
          <>
            <ol className="mt-6 divide-y divide-line border-y border-line">
              {shown!.map((b) => (
                <li key={b.voter} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3.5 text-[14px]">
                  <span className="tnum min-w-0 truncate text-foreground" title={b.voter}>
                    {shortAddress(b.voter)}
                  </span>
                  <span className="tnum text-right text-foreground">{formatGloam(b.weight)} GLOAM</span>
                  <span className="min-w-0 truncate text-mute">{b.choice}</span>
                  <span className="tnum truncate text-right text-[12.5px] text-faint" title={b.signature}>
                    sig {b.signature.slice(0, 10)}…
                  </span>
                </li>
              ))}
            </ol>
            {list.length > LIST_PAGE && (
              <button type="button" onClick={() => setShowAll((x) => !x)} className="btn btn-quiet btn-sm mt-4">
                {showAll ? "Show fewer" : `Show all ${list.length}`}
              </button>
            )}
          </>
        )}
      </section>

      {/* not counted */}
      <section className="mx-auto max-w-[760px] px-5 pb-20 pt-16 sm:px-7 sm:pb-28 sm:pt-20" aria-labelledby="excluded-title">
        <h2 id="excluded-title" className="t-display-m">
          Not counted
        </h2>
        <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-mute">
          GLOAM in these addresses carries no weight. The team holds no tokens; its wallets are listed anyway.
        </p>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {s.excluded.map((e) => (
            <li key={e.address} className="grid grid-cols-1 gap-1 py-3.5 text-[14px] sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
              <span className="tnum text-foreground" title={e.address}>
                {shortAddress(e.address)}
              </span>
              <span className="text-mute">{e.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {wcOpen && <WalletConnectSheet open={wcOpen} onClose={() => setWcOpen(false)} />}
    </>
  );
}
