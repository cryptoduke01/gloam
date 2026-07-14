"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { isShieldDeployed } from "@/lib/shield";
import { PROOF_LAYOUT_VERSION } from "@/lib/note";
import { StatusPill } from "./StatusPill";

/** Private transfer — no fake txs. Shows Phase-2 readiness. */
export function MoveView() {
  const shieldLive = isShieldDeployed();
  const { address } = useAccount();
  const { open } = useLocalShieldNotes(address);

  const boundReady = open.filter(
    (n) => n.bound && n.secret && n.secret !== "0x"
  ).length;
  const chainOnly = open.length - boundReady;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-40 border-b border-line">
            <AsciiImage
              src="/ascii/move.png"
              alt=""
              tone="plate"
              className="h-full w-full opacity-50"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/80 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <StatusPill tone="warn">Proofs not live</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground">
                Private move
              </p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-mute">
              Private transfer spends a note with a zero-knowledge proof. We do
              not submit fake proofs from this screen.
            </p>

            <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                Phase 2 scaffold
              </p>
              <ul className="mt-2 space-y-1.5 text-mute">
                <li>
                  <span className="text-foreground">Note binding</span> — new
                  shields lock amount + asset into the commitment
                </li>
                <li>
                  <span className="text-foreground">Public inputs v
                  {PROOF_LAYOUT_VERSION}</span>{" "}
                  — root, nullifier, asset, amount, recipient
                </li>
                <li>
                  <span className="text-foreground">Still missing</span> —
                  circuit + verifying key on chain
                </li>
              </ul>
            </div>

            {shieldLive && open.length > 0 && (
              <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Your notes
                </p>
                <p className="mt-2 text-foreground">
                  {boundReady > 0 ? (
                    <>
                      <strong>{boundReady}</strong> bound note
                      {boundReady === 1 ? "" : "s"} ready for future unshield
                      proofs
                    </>
                  ) : (
                    <>No bound notes in this browser yet</>
                  )}
                </p>
                {chainOnly > 0 && (
                  <p className="mt-1 text-xs text-mute">
                    {chainOnly} deposit
                    {chainOnly === 1 ? "" : "s"} from chain history only (no
                    local secret — Phase-1 style). Re-shield after this update
                    to get bound notes.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {shieldLive && (
                <Link
                  href="/app/shield"
                  className="inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-black"
                >
                  Shield (bound notes)
                </Link>
              )}
              <Link
                href="/app/send"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm text-foreground"
              >
                Send ETH (public)
              </Link>
              <Link
                href="/docs/encryption"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm text-foreground"
              >
                How encryption works
              </Link>
            </div>
          </div>
        </div>
      </div>
      <aside className="space-y-4 lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Status
          </p>
          <ul className="mt-3 space-y-2 text-foreground">
            <li>
              <span className="text-lime">●</span> Shield deposit
            </li>
            <li>
              <span className="text-lime">●</span> Bound notes (app)
            </li>
            <li>
              <span className="text-lime">●</span> Proof layout v
              {PROOF_LAYOUT_VERSION} (contracts source)
            </li>
            <li>
              <span className="text-mute">○</span> Circuit + verifier deploy
            </li>
            <li>
              <span className="text-mute">○</span> Private transfer UI
            </li>
            <li>
              <span className="text-mute">○</span> Private unshield UI
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="text-foreground">
            Live pool on RH testnet is still Phase-1 (no verifier). New contract
            source is ready for a verifier when circuits land — we will not plug
            in a fake one.
          </p>
        </div>
      </aside>
    </div>
  );
}
