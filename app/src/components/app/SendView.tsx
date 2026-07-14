"use client";

import { useState } from "react";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useChainId,
} from "wagmi";
import { isAddress, parseEther } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
} from "@/lib/chain";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";

/**
 * Real public ETH send on Robinhood Chain testnet.
 * Not private — deliberately the open-book path so the product settles something true.
 */
export function SendView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { data: bal, refetch } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    sendTransaction,
    data: hash,
    isPending,
    error: sendError,
    reset,
  } = useSendTransaction();

  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: PRODUCT_CHAIN_ID,
  });

  if (isSuccess) {
    void refetch();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    reset();

    if (!isConnected || !onProduct) {
      setFormError("Connect and switch to Robinhood Chain testnet (46630).");
      return;
    }
    if (!isAddress(to)) {
      setFormError("Enter a valid 0x address.");
      return;
    }
    let value: bigint;
    try {
      value = parseEther(amount || "0");
    } catch {
      setFormError("Invalid amount.");
      return;
    }
    if (value <= BigInt(0)) {
      setFormError("Amount must be greater than zero.");
      return;
    }
    if (bal && value > bal.value) {
      setFormError("Insufficient public ETH on testnet.");
      return;
    }

    sendTransaction({
      to: to as `0x${string}`,
      value,
      chainId: PRODUCT_CHAIN_ID,
    });
  }

  const maxEth = bal ? formatEth(bal.value, 6) : "0";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-36 border-b border-line sm:h-40">
            <AsciiImage
              src="/ascii/move.png"
              alt=""
              tone="plate"
              className="h-full w-full"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/50 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <StatusPill tone="lime">Public path · live</StatusPill>
              <p className="mt-2 font-display text-xl text-foreground sm:text-2xl">
                Send on the open book
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6">
            <div>
              <label
                htmlFor="send-to"
                className="text-sm font-medium text-foreground"
              >
                To
              </label>
              <input
                id="send-to"
                autoComplete="off"
                spellCheck={false}
                placeholder="0x…"
                value={to}
                onChange={(e) => setTo(e.target.value.trim())}
                className="mt-2 min-h-12 w-full rounded-md border border-line bg-transparent px-4 font-mono text-sm text-foreground outline-none placeholder:text-mute focus:border-lime"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="send-amount"
                  className="text-sm font-medium text-foreground"
                >
                  Amount
                </label>
                <button
                  type="button"
                  className="text-xs text-lime hover:underline disabled:opacity-40"
                  disabled={!isConnected}
                  onClick={() =>
                    setAmount(maxEth === "<0.0001" ? "0" : maxEth.replace(/,/g, ""))
                  }
                >
                  Max {isConnected ? maxEth : "—"} ETH
                </button>
              </div>
              <div className="mt-2 flex overflow-hidden rounded-md border border-line focus-within:border-lime">
                <input
                  id="send-amount"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="min-h-12 flex-1 bg-transparent px-4 text-lg text-foreground outline-none placeholder:text-mute"
                />
                <span className="flex items-center border-l border-line px-4 font-mono text-sm text-mute">
                  ETH
                </span>
              </div>
            </div>

            <p className="text-sm text-mute">
              This is a <strong className="text-foreground">public</strong>{" "}
              transfer on Robinhood Chain testnet. Explorer will see it. Private
              move is a different gate.
            </p>

            {!isConnected || !onProduct ? (
              <ConnectButton />
            ) : (
              <button
                type="submit"
                disabled={isPending || confirming}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
              >
                {isPending
                  ? "Confirm in wallet…"
                  : confirming
                    ? "Confirming…"
                    : "Send public ETH"}
              </button>
            )}

            {(formError || sendError) && (
              <p role="alert" className="text-sm text-red-400">
                {formError || sendError?.message.slice(0, 160)}
              </p>
            )}

            {hash && (
              <div
                role="status"
                className="rounded-md border border-line bg-background px-4 py-3 text-sm"
              >
                {isSuccess ? (
                  <p className="text-foreground">
                    Settled on testnet.{" "}
                    <a
                      href={EXPLORER_TX(hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lime hover:underline"
                    >
                      View transaction →
                    </a>
                  </p>
                ) : (
                  <p className="text-mute">
                    Submitted…{" "}
                    <a
                      href={EXPLORER_TX(hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lime hover:underline"
                    >
                      Explorer
                    </a>
                  </p>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      <aside className="space-y-4 lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Why public first
          </p>
          <p className="mt-3 font-display text-xl text-foreground">
            The app must settle truth
          </p>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Private rails come after. Until then we ship real public moves on
            chain 46630 — no theatre, no fake private success.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Need testnet ETH?
          </p>
          <p className="mt-2">
            Bridge or faucet from Robinhood / Alchemy when available. Gas is
            ETH on chain <span className="text-foreground">46630</span>.
          </p>
        </div>
      </aside>
    </div>
  );
}
