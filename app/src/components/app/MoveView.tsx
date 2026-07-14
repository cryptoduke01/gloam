"use client";

import Link from "next/link";
import { AsciiImage } from "@/components/AsciiImage";
import { StatusPill } from "./StatusPill";

/** Honest placeholder — public token send is under Trade / Send. */
export function MoveView() {
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
              Private transfers need shielded notes and nullifiers. Nothing is
              submitted from this screen.
            </p>
            <p className="text-sm text-mute">
              For <strong className="text-foreground">public</strong> moves on
              testnet right now:
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/app/send"
                className="inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-black"
              >
                Send ETH
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
          Public path is live. Private path ships after shield.
        </div>
      </aside>
    </div>
  );
}
