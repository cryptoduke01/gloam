"use client";

import Link from "next/link";
import { AsciiImage } from "@/components/AsciiImage";
import { isShieldDeployed } from "@/lib/shield";
import { StatusPill } from "./StatusPill";

/** Private transfer still closed — no fake txs. */
export function MoveView() {
  const shieldLive = isShieldDeployed();

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
              <StatusPill tone="warn">Not live</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground">
                Private move
              </p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-mute">
              Moving between notes needs a verifier and proofs. We do not fake
              that here.
            </p>
            {shieldLive ? (
              <p className="text-sm text-mute">
                <strong className="text-foreground">Shield is live</strong> —
                you can deposit ETH into the pool. Exit and private transfer
                still wait on Phase 2.
              </p>
            ) : (
              <p className="text-sm text-mute">
                Shield the pool first, then private move can ship.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {shieldLive && (
                <Link
                  href="/app/shield"
                  className="inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-black"
                >
                  Open shield
                </Link>
              )}
              <Link
                href="/app/send"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm text-foreground"
              >
                Send ETH (public)
              </Link>
              <Link
                href="/app/trade"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm text-foreground"
              >
                Send stock tokens
              </Link>
            </div>
          </div>
        </div>
      </div>
      <aside className="lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Status
          </p>
          <ul className="mt-3 space-y-2 text-foreground">
            <li>
              <span className="text-lime">●</span> Shield deposit
            </li>
            <li>
              <span className="text-mute">○</span> Private transfer
            </li>
            <li>
              <span className="text-mute">○</span> Private unshield
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
