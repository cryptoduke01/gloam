"use client";

import Link from "next/link";
import { AsciiImage } from "@/components/AsciiImage";
import { StatusPill } from "./StatusPill";

/** Honest placeholder — no fake shield txs. */
export function ShieldView() {
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-40 border-b border-line">
            <AsciiImage
              src="/ascii/shield.png"
              alt=""
              tone="plate"
              className="h-full w-full opacity-50"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/80 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <StatusPill tone="warn">Not live</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground">
                Shield
              </p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-mute">
              Contracts Phase 1 (custody + Merkle tree) is in{" "}
              <code className="text-foreground">contracts/</code>. UI stays
              closed until a testnet deploy + verifier — no mock success.
            </p>
            <ul className="space-y-2 text-sm text-mute">
              <li>
                <span className="text-lime">01</span> Commit amount into a note
              </li>
              <li>
                <span className="text-lime">02</span> Prove validity without
                revealing size
              </li>
              <li>
                <span className="text-lime">03</span> Join the anonymity set
              </li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href="/app"
                className="inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-black"
              >
                Back to portfolio
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
      <aside className="lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Testnet now
          </p>
          <p className="mt-2 text-foreground">
            Use Send and Trade (transfer stocks) while the private path is built.
          </p>
        </div>
      </aside>
    </div>
  );
}
