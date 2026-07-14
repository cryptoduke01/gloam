"use client";

import Link from "next/link";
import { useAccount, useBalance, useChainId } from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { PRODUCT_CHAIN_ID, formatEth, shortAddress } from "@/lib/chain";
import { FAUCET_BLURB, FAUCET_URL } from "@/lib/faucet";
import { ActivityFeed } from "./ActivityFeed";
import { ConnectButton } from "./ConnectButton";
import { NetworkPulse } from "./NetworkPulse";
import { ReceiveCard } from "./ReceiveCard";
import { StatusPill } from "./StatusPill";

const gates = [
  {
    href: "/app/send",
    title: "Send",
    body: "Move public ETH on testnet. Live now.",
    n: "00",
    live: true,
  },
  {
    href: "/app/shield",
    title: "Shield",
    body: "Lock value into a private note.",
    n: "01",
    live: false,
  },
  {
    href: "/app/move",
    title: "Move",
    body: "Private transfer. Path stays sealed.",
    n: "02",
    live: false,
  },
  {
    href: "/app/trade",
    title: "Trade",
    body: "Stocks and memes. Private book next.",
    n: "03",
    live: false,
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
      <NetworkPulse />

      {/* Faucet banner */}
      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noreferrer"
        className="flex flex-col gap-2 rounded-xl border border-lime/35 bg-panel px-5 py-4 transition-colors hover:border-lime sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
            Need testnet ETH?
          </p>
          <p className="mt-1 text-sm text-mute">{FAUCET_BLURB}</p>
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black">
          Open faucet →
        </span>
      </a>

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
              <StatusPill tone="lime">Testnet</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground sm:text-3xl">
                Your public balance
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
              <p className="mt-1 text-xs text-mute">Robinhood testnet</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                Private
              </p>
              <p className="mt-2 font-display text-3xl text-foreground">
                0 <span className="text-lg text-mute">notes</span>
              </p>
              <p className="mt-1 text-xs text-mute">Shield opens next</p>
            </div>
          </div>
          {!isConnected && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-mute">Connect your wallet to begin.</p>
                <ConnectButton />
              </div>
            </div>
          )}
          {isConnected && !onProduct && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Switch to Robinhood testnet.
              </p>
              <div className="mt-3">
                <ConnectButton />
              </div>
            </div>
          )}
          {isConnected && address && onProduct && (
            <div className="border-t border-line px-5 py-3 font-mono text-[11px] text-mute sm:px-6">
              {shortAddress(address, 6)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Quick
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/app/send"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-lime text-sm font-semibold text-black hover:opacity-90"
              >
                Send
              </Link>
              <Link
                href="/app/trade"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
              >
                Trade
              </Link>
              <Link
                href="/app/markets"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
              >
                Markets
              </Link>
              <Link
                href="/app/settings"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line text-sm font-medium text-foreground hover:border-mute"
              >
                Settings
              </Link>
            </div>
          </div>
          <ReceiveCard />
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Product
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {gates.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:border-lime/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-lime">{g.n}</span>
                {g.live ? (
                  <StatusPill tone="lime">Live</StatusPill>
                ) : (
                  <StatusPill tone="warn">Soon</StatusPill>
                )}
              </div>
              <h2 className="mt-3 font-display text-2xl text-foreground">
                {g.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">{g.body}</p>
            </Link>
          ))}
        </div>
      </div>

      <ActivityFeed />
    </div>
  );
}
