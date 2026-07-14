"use client";

import Link from "next/link";
import { useAccount, useBalance, useChainId } from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { PRODUCT_CHAIN_ID, formatEth, shortAddress } from "@/lib/chain";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";

const gates = [
  {
    href: "/app/shield",
    title: "Shield",
    body: "Park public balances into sealed notes. The graph loses the thread.",
    n: "01",
  },
  {
    href: "/app/move",
    title: "Move",
    body: "Private transfer between shielded parties. Silence on the open tape.",
    n: "02",
  },
  {
    href: "/app/trade",
    title: "Trade",
    body: "Stocks and memes without printing size and intent to the street.",
    n: "03",
  },
];

export function PortfolioView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { data: bal, isLoading } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  return (
    <div className="space-y-8">
      {/* Hero strip */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-xl border border-line bg-panel lg:col-span-7">
          <div className="relative h-40 border-b border-line sm:h-48">
            <AsciiImage
              src="/ascii/shield.png"
              alt=""
              tone="plate"
              className="h-full w-full"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <StatusPill tone="lime">Testnet portfolio</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                Public book. Private chamber next.
              </p>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Public ETH
              </p>
              {!isConnected ? (
                <p className="mt-2 font-display text-3xl text-mute">—</p>
              ) : isLoading ? (
                <p className="mt-2 font-display text-3xl text-mute">…</p>
              ) : (
                <p className="mt-2 font-display text-3xl text-foreground">
                  {formatEth(bal?.value ?? BigInt(0))}{" "}
                  <span className="text-lg text-mute">ETH</span>
                </p>
              )}
              <p className="mt-1 text-xs text-mute">
                Robinhood Chain testnet · visible on explorer
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Shielded
              </p>
              <p className="mt-2 font-display text-3xl text-foreground">
                0{" "}
                <span className="text-lg text-mute">notes</span>
              </p>
              <p className="mt-1 text-xs text-mute">
                Empty until shield contracts are live — not simulated
              </p>
            </div>
          </div>
          {!isConnected && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-mute">
                  Connect a wallet on Robinhood Chain testnet to see balances.
                </p>
                <ConnectButton />
              </div>
            </div>
          )}
          {isConnected && !onProduct && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Wrong network. Switch to Robinhood Chain testnet (46630).
              </p>
              <div className="mt-3">
                <ConnectButton />
              </div>
            </div>
          )}
          {isConnected && address && onProduct && (
            <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-mute sm:px-6">
              {shortAddress(address, 6)} · chain {chainId}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5 sm:p-6 lg:col-span-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            At a glance
          </p>
          <dl className="space-y-3 text-sm">
            {[
              ["Network", "Robinhood testnet"],
              ["Chain ID", "46630"],
              ["Privacy", "Rails shipping"],
              ["Assets", "Stocks · Memes"],
              ["Status", "Connect → explore"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between border-b border-line pb-2 last:border-0"
              >
                <dt className="text-mute">{k}</dt>
                <dd className="font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/app/markets"
            className="mt-auto inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
          >
            Browse markets
          </Link>
        </div>
      </div>

      {/* Gates */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Three gates
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {gates.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:border-lime/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-lime">{g.n}</span>
                <span className="text-mute transition-colors group-hover:text-lime">
                  →
                </span>
              </div>
              <h2 className="mt-3 font-display text-2xl text-foreground">
                {g.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">{g.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
