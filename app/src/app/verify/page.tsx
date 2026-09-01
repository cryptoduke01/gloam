"use client";

import Link from "next/link";
import { useState } from "react";
import { formatUnits, toHex } from "viem";
import {
  decodeDisclosure,
  verifyDisclosureProof,
  type Disclosure,
} from "@/lib/disclosure";
import { getRhPublicClient } from "@/lib/rhClient";
import { shieldPoolAbi } from "@/lib/shield";

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ flex: "none" }}>
      <rect width="32" height="32" rx="9" fill="#121316" />
      <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#f4f3ef" />
    </svg>
  );
}

type Result =
  | { kind: "idle" }
  | { kind: "checking"; step: string }
  | {
      kind: "ok";
      d: Disclosure;
      onchain: boolean;
    }
  | { kind: "bad"; reason: string };

function assetLabel(asset: string): string {
  if (asset === "0" || BigInt(asset) === 0n) return "ETH";
  const addr = toHex(BigInt(asset), { size: 20 });
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function VerifyPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  async function onVerify() {
    setResult({ kind: "checking", step: "Reading the disclosure" });
    let d: Disclosure;
    try {
      d = decodeDisclosure(token);
    } catch {
      setResult({ kind: "bad", reason: "That is not a valid Gloam disclosure." });
      return;
    }

    try {
      setResult({ kind: "checking", step: "Verifying the proof" });
      const proofOk = await verifyDisclosureProof(d);
      if (!proofOk) {
        setResult({ kind: "bad", reason: "The proof did not verify." });
        return;
      }

      // Membership: is this commitment a real note in the pool?
      setResult({ kind: "checking", step: "Checking the note is in the pool" });
      let onchain = false;
      try {
        const client = getRhPublicClient();
        const commitment32 = toHex(BigInt(d.commitment), { size: 32 });
        onchain = (await client.readContract({
          address: d.pool as `0x${string}`,
          abi: shieldPoolAbi,
          functionName: "commitmentSeen",
          args: [commitment32],
        })) as boolean;
      } catch {
        onchain = false; // treat RPC failure as "unconfirmed", not "invalid"
      }

      setResult({ kind: "ok", d, onchain });
    } catch (e) {
      setResult({
        kind: "bad",
        reason: e instanceof Error ? e.message : "Verification failed.",
      });
    }
  }

  const checking = result.kind === "checking";

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Mark />
            <span className="text-[19px] font-semibold tracking-tight">Gloam</span>
          </Link>
          <span className="text-[10px] uppercase tracking-[0.16em] text-mute">
            Disclosure
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14 sm:px-8 sm:py-20">
        <p className="text-[11px] uppercase tracking-[0.22em] text-lime">
          Verify a disclosure
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">
          Private by default. Proven by choice.
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-mute">
          Paste a Gloam disclosure below. It proves the holder owns a specific
          shielded balance in the vault, without revealing their identity, their
          note secret, or any of their other holdings.
        </p>

        <div className="mt-10">
          <label
            htmlFor="disc"
            className="text-[10px] uppercase tracking-[0.16em] text-mute"
          >
            Disclosure
          </label>
          <textarea
            id="disc"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="gloamdisc1:…"
            rows={5}
            className="mt-3 w-full resize-y rounded-2xl border border-line bg-panel px-4 py-3.5 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-mute/60 focus:border-lime/50"
          />
          <button
            type="button"
            onClick={() => void onVerify()}
            disabled={!token.trim() || checking}
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-lime px-6 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {checking ? (result as { step: string }).step + "…" : "Verify"}
          </button>
        </div>

        {result.kind === "bad" && (
          <div className="mt-8 rounded-2xl border border-[#C0432F]/30 bg-[#C0432F]/[0.06] p-6">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#C0432F]">
              Not verified
            </p>
            <p className="mt-2 text-[15px] text-foreground">{result.reason}</p>
          </div>
        )}

        {result.kind === "ok" && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="border-b border-line px-6 py-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#2E7D53]" aria-hidden />
                <span className="text-[10px] uppercase tracking-[0.16em] text-[#2E7D53]">
                  Cryptographically verified
                </span>
              </div>
              <p className="mt-3 font-display text-2xl tracking-tight">
                Holds{" "}
                <span className="tnum">
                  {formatUnits(BigInt(result.d.amount), 18)}
                </span>{" "}
                {assetLabel(result.d.asset)}
              </p>
              <p className="mt-1 text-sm text-mute">
                in the Gloam vault. The holder proved knowledge of the note secret
                binding this commitment to the amount and asset.
              </p>
            </div>
            <dl className="grid gap-x-8 gap-y-3 px-6 py-5 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-mute">In the pool</dt>
              <dd className={result.onchain ? "text-[#2E7D53]" : "text-mute"}>
                {result.onchain
                  ? "Yes — commitment is a live note on-chain"
                  : "Unconfirmed (could not reach the RPC)"}
              </dd>
              <dt className="text-mute">Pool</dt>
              <dd className="tnum break-all text-foreground">{result.d.pool}</dd>
              <dt className="text-mute">Commitment</dt>
              <dd className="tnum break-all text-foreground">
                {toHex(BigInt(result.d.commitment), { size: 32 })}
              </dd>
            </dl>
          </div>
        )}

        <p className="mt-10 text-[13px] leading-relaxed text-mute">
          Verification runs entirely in your browser: the zero-knowledge proof is
          checked locally and the note is looked up directly on Robinhood Chain. No
          wallet, no account, nothing sent to Gloam.
        </p>
      </main>
    </div>
  );
}
