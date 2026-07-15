"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AsciiImage } from "@/components/AsciiImage";

const STORIES = [
  `You left the trail where the lime light dies. Between the trees — if they are trees — the air is thick with commitments that never resolved. Something has been walking parallel to you for three screens now. It does not hurry. It does not need to. Every dead link on this domain is a root it already owns. You feel the dirt under the pixels, the moss of abandoned routes. When you stop scrolling, you hear it stop too. When you move, so does it. The forest is not lost. You are the one without a path. And the thing wearing your click history has almost finished learning your face.`,

  `There was a developer who mapped every 404 for sport. He wrote a crawler, fed it seeds, and watched the null responses bloom. On the four hundredth miss the terminal went green — not his theme, not his choice. A single line printed: YOU ARE LOOKING FOR ME. He closed the laptop. In the reflection of the black glass he saw a second face, standing in a corridor of trunks that should not exist inside a browser. His wallet drained that night. Not a hack. A payment. As if he had always owed the forest for walking through it. His browser still opens to this page. Alone. Waiting.`,

  `The vault does not store money here. It stores absences. Pages that were planned, routes that were renamed, dreams of product managers who shipped nothing. They grow like undergrowth in the dark, lime-veined and patient. You stepped on one. It cracked. From the fracture rose a smell like rain on copper and something breathing too close to your ear. “You asked for a path,” it said without a mouth. “I am what answers when the path is a lie.” Do not run. The forest rearranges when you run. Walk back the way you came, eyes down, and pray the silence does not learn your name.`,

  `Once, a woman followed a broken share link into the gloam. She thought it was a bug. She documented the UI, took screenshots of the empty state, drafted a polite report. While she typed, the background image — the trees, the lime, the waiting dark — began to move without animation. Branches rearranged into letters. The letters spelled her private key, one character at a time, as if the forest had always known. She never sent the report. She never logged in again. Her last localStorage entry was a single word: LISTENING. Refresh if you want to meet her. Or leave, while leaving is still allowed.`,

  `In the anonymity set there is always room for one more ghost. You volunteered the moment you typed a URL that did not exist. The merkle leaves above you are not data structures tonight — they are canopy. Light filters through them the color of acid and warning. Below, something with too many limbs is counting nullifiers. Yours is almost ready. It does not hate you. Hate requires a public face. It only wants what every sealed chamber wants: one more secret that never leaves. Stay long enough and you will understand the quiet. Stay longer and you will not want the map back.`,

  `They say private money leaves no confession. That is a comfort for people who stay on the trail. Off-path, the confessions pile up — not of trades, but of curiosity. Every 404 is a small sin against the intended architecture, and the forest feeds on intention gone wrong. Look at the green. It is not brand. It is chlorophyll from something that learned to photosynthesize on HTTP errors. It grows toward you when you stare. Blink. The trees have moved closer. The story has already changed once while you were reading. It will change again. That is how it hunts: by making you wait for the next sentence.`,

  `There is a clearing in the middle of this site that no sitemap lists. You are standing in it. The ground is soft with forgotten commits. Overhead, the hero image breathes — dithered, lime-stained, older than the deploy that put it here. If you listen past your pulse you will hear a proof generating forever, a circuit that never returns, a witness that knows your coordinates. The engineers call it a bug. The forest calls it dinner. Choose a door that still works. Home. The app. Anywhere with a name. Names keep the dark from finishing yours.`,

  `A boy once hit refresh on a missing page one hundred times, daring the void. On the hundredth load the countdown was gone. In its place: a forest that filled the viewport, and a figure at the far edge of the dither, holding something that looked like a payment ticket. The boy leaned in. The figure leaned too. Their faces met in the glass. Only one of them left the room. The other is still here, in the pixels behind this paragraph, waiting for someone patient enough to read to the end. You almost are. Leave before you finish. Leaving is the only proof that still verifies.`,
];

const ROTATE_MS = 14_000;

export default function NotFound() {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);

  // Start on a random story after mount (avoids SSR mismatch)
  useEffect(() => {
    setIdx(Math.floor(Math.random() * STORIES.length));
    setReady(true);
  }, []);

  // Auto-rotate at intervals — no user control
  useEffect(() => {
    if (!ready || reduce) return;
    const id = window.setInterval(() => {
      setIdx((i) => {
        if (STORIES.length < 2) return i;
        let next = i;
        while (next === i) {
          next = Math.floor(Math.random() * STORIES.length);
        }
        return next;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [ready, reduce]);

  const story = STORIES[idx] ?? STORIES[0];

  return (
    <div className="flex min-h-full flex-col bg-background">
      <Header />
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Full-bleed lone forest — hero dither + lime */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <AsciiImage
            src="/ascii/hero.png"
            alt=""
            tone="plate"
            priority
            fit="cover"
            className="h-full w-full scale-105"
            sizes="100vw"
          />
          {/* Darken edges like dense woods; keep a clearing in the center */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/45 to-black/90" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/70" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_70%,rgba(0,0,0,0.9)_100%)]" />
          <div className="absolute left-1/2 top-[40%] h-[50vh] w-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/[0.07] blur-[100px]" />
          {/* Subtle mist lines */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.35) 3px, rgba(0,0,0,0.35) 4px)",
            }}
          />
        </div>

        <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-14 sm:px-8 sm:py-20">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-lime">
              <span className="livedot h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_12px_var(--lime)]" />
              Off the path · 404
            </p>
            <h1 className="mt-4 font-display text-6xl tracking-tight text-white sm:text-7xl lg:text-8xl">
              Lost
            </h1>
            <p className="mt-3 max-w-lg font-display text-xl text-white/70 sm:text-2xl">
              A lone forest where pages go to die.
            </p>
          </motion.div>

          <div className="mt-10 min-h-[12rem] rounded-2xl border border-white/10 bg-black/55 p-5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--lime)_15%,transparent)] backdrop-blur-md sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
              Something in the trees is speaking
            </p>
            <div className="mt-4" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.p
                  key={idx}
                  initial={
                    reduce ? false : { opacity: 0, y: 10, filter: "blur(4px)" }
                  }
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={
                    reduce
                      ? undefined
                      : { opacity: 0, y: -8, filter: "blur(4px)" }
                  }
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="text-[15px] leading-[1.75] text-white/85 sm:text-base"
                >
                  {story}
                </motion.p>
              </AnimatePresence>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
              Fragments shift on their own · do not wait for the ending
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              Leave the forest
            </Link>
            <Link
              href="/app"
              className="inline-flex min-h-11 items-center rounded-md border border-white/15 bg-black/40 px-5 text-sm font-medium text-white hover:border-lime/40"
            >
              Testnet app
            </Link>
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center px-2 text-sm text-white/50 underline-offset-4 hover:text-lime hover:underline"
            >
              Docs
            </Link>
          </div>

          <p className="mt-12 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
            The canopy remembers every wrong turn
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
