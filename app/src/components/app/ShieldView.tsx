"use client";

import { useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { PRODUCT_CHAIN_ID, formatEth } from "@/lib/chain";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";

export function ShieldView() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const maxEth = bal ? formatEth(bal.value, 6) : "0";

  function onShield(e: React.FormEvent) {
    e.preventDefault();
    // Honest gate — never simulate a private success
    setNote(
      "Shield contracts are not live on testnet yet. Your amount was not submitted. Follow @gloamtrade for the first real shield."
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-36 border-b border-line sm:h-44">
            <AsciiImage
              src="/ascii/shield.png"
              alt=""
              tone="plate"
              className="h-full w-full"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/40 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <StatusPill tone="warn">Circuits pending</StatusPill>
              <p className="mt-2 font-display text-xl text-foreground sm:text-2xl">
                Clear balance → sealed note
              </p>
            </div>
          </div>

          <form onSubmit={onShield} className="space-y-5 p-5 sm:p-6">
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="shield-amount"
                  className="text-sm font-medium text-foreground"
                >
                  Amount to shield
                </label>
                <button
                  type="button"
                  className="text-xs text-lime hover:underline"
                  onClick={() => setAmount(maxEth === "<0.0001" ? "0" : maxEth)}
                  disabled={!isConnected}
                >
                  Max {isConnected ? maxEth : "—"} ETH
                </button>
              </div>
              <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                <input
                  id="shield-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute"
                />
                <span className="flex items-center border-l border-line px-4 font-mono text-sm text-mute">
                  ETH
                </span>
              </div>
            </div>

            <ol className="space-y-2 text-sm text-mute">
              <li className="flex gap-2">
                <span className="text-lime">01</span> Commit amount into a
                ciphertext
              </li>
              <li className="flex gap-2">
                <span className="text-lime">02</span> Prove well-formedness
                without revealing size
              </li>
              <li className="flex gap-2">
                <span className="text-lime">03</span> Note enters the anonymity
                set
              </li>
            </ol>

            {!isConnected ? (
              <ConnectButton className="w-full [&_button]:w-full [&_button]:justify-center" />
            ) : (
              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime text-sm font-semibold text-black hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
              >
                Shield when live
              </button>
            )}

            {note && (
              <p
                role="status"
                className="rounded-md border border-line bg-background px-4 py-3 text-sm text-mute"
              >
                {note}
              </p>
            )}
          </form>
        </div>
      </div>

      <aside className="space-y-4 lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Why this gate
          </p>
          <p className="mt-3 font-display text-xl text-foreground">
            What the chain cannot see
          </p>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Shield is the door into the sealed chamber. Until proofs and the
            anonymity set exist on-chain, we will not pretend a note was created.
            The form is real; the settlement is not — yet.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Read
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a href="/docs/encryption" className="text-lime hover:underline">
                How money is encrypted →
              </a>
            </li>
            <li>
              <a href="/docs/privacy-model" className="text-lime hover:underline">
                Privacy model →
              </a>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
