"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect, useChainId } from "wagmi";
import {
  EXPLORER_ADDRESS,
  PRODUCT_CHAIN_ID,
  RH_TESTNET_WALLET_PARAMS,
  shortAddress,
} from "@/lib/chain";
import { FAUCET_BLURB, FAUCET_URL } from "@/lib/faucet";
import { useTheme } from "@/components/ThemeProvider";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";

export function SettingsView() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { theme, setTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [netMsg, setNetMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyAddr() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
  }

  async function addNetwork() {
    setNetMsg(null);
    const eth = (
      window as Window & {
        ethereum?: {
          request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
        };
      }
    ).ethereum;
    if (!eth?.request) {
      setNetMsg("No wallet found.");
      return;
    }
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [RH_TESTNET_WALLET_PARAMS],
      });
      setNetMsg("Network added. Switch to Robinhood testnet if needed.");
    } catch (e) {
      setNetMsg(e instanceof Error ? e.message.slice(0, 120) : "Could not add network");
    }
  }

  const onProduct = chainId === PRODUCT_CHAIN_ID;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Wallet */}
      <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Wallet
        </p>
        {!isConnected || !address ? (
          <div className="mt-4">
            <p className="text-sm text-mute">Connect to manage your session.</p>
            <div className="mt-3">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="break-all font-mono text-sm text-foreground">{address}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyAddr}
                className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm text-foreground hover:border-mute"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={EXPLORER_ADDRESS(address)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm text-foreground hover:border-mute"
              >
                View on explorer
              </a>
              <button
                type="button"
                onClick={() => disconnect()}
                className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-sm text-mute hover:text-foreground"
              >
                Disconnect
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {onProduct ? (
                <StatusPill tone="lime">Robinhood testnet</StatusPill>
              ) : (
                <StatusPill tone="warn">Wrong network</StatusPill>
              )}
              <span className="font-mono text-xs text-mute">
                {shortAddress(address, 4)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Network */}
      <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Network
        </p>
        <p className="mt-2 font-display text-xl text-foreground">
          Robinhood Chain testnet
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-mute">Chain ID</dt>
            <dd className="font-mono text-foreground">46630</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mute">Gas</dt>
            <dd className="text-foreground">ETH</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={addNetwork}
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-lime px-4 text-sm font-semibold text-black hover:opacity-90"
        >
          Add network to wallet
        </button>
        {netMsg && <p className="mt-2 text-sm text-mute">{netMsg}</p>}
      </section>

      {/* Faucet */}
      <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Testnet ETH
        </p>
        <p className="mt-2 font-display text-xl text-foreground">Free faucet</p>
        <p className="mt-2 text-sm text-mute">{FAUCET_BLURB}</p>
        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-medium text-foreground hover:border-lime/50"
        >
          Open faucet →
        </a>
      </section>

      {/* Theme */}
      <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
          Appearance
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`min-h-11 rounded-md text-sm font-medium ${
              theme === "dark"
                ? "bg-lime text-black"
                : "border border-line text-mute hover:text-foreground"
            }`}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`min-h-11 rounded-md text-sm font-medium ${
              theme === "light"
                ? "bg-lime text-black"
                : "border border-line text-mute hover:text-foreground"
            }`}
          >
            Light
          </button>
        </div>
      </section>

      <p className="text-center text-xs text-mute">
        Gloam testnet · gloam.trade/app
      </p>
    </div>
  );
}
