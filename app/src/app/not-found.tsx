"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AsciiImage } from "@/components/AsciiImage";

const STORIES = [
  "You took a wrong turn past the vault door. Something in the dark already knows your route. It does not need your address — only the sound of your footsteps on empty URLs.",
  "There was a page here once. The pool swallowed it. When explorers dig too deep, the merkle leaves whisper back names that were never public. Yours is next.",
  "404 is not an error. It is a warning left by the last person who followed a dead link. They are still proving a circuit that never finishes.",
  "The sealed chamber does not open for the curious. You are not lost — you are being measured. Turn around before the nullifier of your curiosity is spent.",
  "Someone deleted this path on purpose. Not for cleanliness. Because whatever answered here learned to answer back. The lime glow in the corner is not design.",
  "You asked for a page that does not exist. The chain remembers every request. Including this one. Especially this one.",
  "In the anonymity set there is always room for one more ghost. Congratulations. You just volunteered.",
  "The faucet is dry. The RPC is silent. The only thing listening is whatever lives between routes that were never deployed.",
  "A man once mapped every 404 on this site. They found his wallet empty and his browser open to a single blank tab. The tab still loads. For him.",
  "Do not refresh. Refreshing invites it closer. Walk back to the light — home, docs, the app — while your path is still optional.",
  "Private money leaves no confession. Dead pages leave only fear. Choose which ledger you prefer.",
  "You are not supposed to be here. That is why the air tastes like static and lime. Leave before the countdown finishes a number you cannot see.",
];

export default function NotFound() {
  const initial = useMemo(
    () => Math.floor(Math.random() * STORIES.length),
    [],
  );
  const [idx, setIdx] = useState(initial);
  const story = STORIES[idx] ?? STORIES[0];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <Header />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <AsciiImage
            src="/ascii/rim.png"
            alt=""
            tone="plate"
            className="h-full w-full opacity-[0.18]"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background" />
          <div className="absolute left-1/2 top-1/4 h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-lime/[0.05] blur-[100px]" />
        </div>

        <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime">
            Path not found
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-tight text-foreground sm:text-7xl">
            404
          </h1>
          <p className="mt-2 font-display text-xl text-mute sm:text-2xl">
            You have stepped off the map.
          </p>

          <blockquote className="mt-10 border-l-2 border-lime/50 bg-panel/60 py-5 pl-5 pr-4 text-base leading-relaxed text-mute">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
              Fragment recovered
            </p>
            <p className="mt-3 text-foreground/90">{story}</p>
          </blockquote>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90"
            >
              Return home
            </Link>
            <Link
              href="/app"
              className="inline-flex min-h-11 items-center rounded-md border border-line px-5 text-sm font-medium text-foreground hover:border-mute"
            >
              Testnet app
            </Link>
            <button
              type="button"
              onClick={() =>
                setIdx((i) => {
                  let n = i;
                  while (n === i && STORIES.length > 1) {
                    n = Math.floor(Math.random() * STORIES.length);
                  }
                  return n;
                })
              }
              className="inline-flex min-h-11 items-center px-2 text-sm text-mute underline-offset-4 hover:text-lime hover:underline"
            >
              Another fragment
            </button>
          </div>

          <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            Do not linger · the vault is listening
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
