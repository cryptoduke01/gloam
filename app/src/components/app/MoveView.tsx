"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AsciiImage } from "@/components/AsciiImage";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";

export function MoveView() {
  const { isConnected } = useAccount();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function onMove(e: React.FormEvent) {
    e.preventDefault();
    setNote(
      "Private transfer is not live on testnet yet. Nothing was broadcast. No nullifier was published."
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-36 border-b border-line sm:h-44">
            <AsciiImage
              src="/ascii/move.png"
              alt=""
              tone="plate"
              className="h-full w-full"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/50 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <StatusPill tone="warn">Private path pending</StatusPill>
              <p className="mt-2 font-display text-xl text-foreground sm:text-2xl">
                Transfer as silence
              </p>
            </div>
          </div>

          <form onSubmit={onMove} className="space-y-5 p-5 sm:p-6">
            <div>
              <label
                htmlFor="move-to"
                className="text-sm font-medium text-foreground"
              >
                Recipient
              </label>
              <input
                id="move-to"
                autoComplete="off"
                placeholder="0x… or viewing key handle"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-md border border-line bg-transparent px-4 font-mono text-sm text-foreground outline-none placeholder:text-mute focus:border-lime"
              />
            </div>
            <div>
              <label
                htmlFor="move-amount"
                className="text-sm font-medium text-foreground"
              >
                Amount
              </label>
              <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                <input
                  id="move-amount"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute"
                />
                <span className="flex items-center border-l border-line px-4 font-mono text-sm text-mute">
                  NOTE
                </span>
              </div>
            </div>

            <p className="text-sm text-mute">
              Nullify old note → issue new note. The open tape sees structure,
              not sender, size, or path.
            </p>

            {!isConnected ? (
              <ConnectButton />
            ) : (
              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime text-sm font-semibold text-black hover:opacity-90"
              >
                Move when live
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

      <aside className="lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Requirements
          </p>
          <ul className="mt-4 space-y-3 text-sm text-mute">
            <li className="flex gap-2">
              <span className="text-lime">→</span> Shielded note balance (gate
              01)
            </li>
            <li className="flex gap-2">
              <span className="text-lime">→</span> Recipient in the private
              domain
            </li>
            <li className="flex gap-2">
              <span className="text-lime">→</span> Live nullifier set on
              Robinhood Chain
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
