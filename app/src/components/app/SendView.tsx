"use client";

import { useEffect, useState } from "react";
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
  shortAddress,
} from "@/lib/chain";
import { FAUCET_URL } from "@/lib/faucet";
import { useEthPrice } from "@/hooks/useLiveMarkets";
import { formatUsd } from "@/lib/markets";
import { ConnectButton } from "./ConnectButton";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

export function SendView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { ethUsd } = useEthPrice();
  const { data: bal, refetch } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sentAmount, setSentAmount] = useState("");

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

  useEffect(() => {
    if (isSuccess && hash) {
      void refetch();
      setShowSuccess(true);
    }
  }, [isSuccess, hash, refetch]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    reset();
    setShowSuccess(false);

    if (!isConnected || !onProduct) {
      setFormError("Connect and switch to Robinhood testnet.");
      return;
    }
    if (!isAddress(to)) {
      setFormError("Enter a valid address.");
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
      setFormError("Not enough testnet ETH.");
      return;
    }

    setSentAmount(amount);
    sendTransaction({
      to: to as `0x${string}`,
      value,
      chainId: PRODUCT_CHAIN_ID,
    });
  }

  const maxEth = bal ? formatEth(bal.value, 6) : "0";
  const amtNum = Number(amount);
  const usdHint =
    ethUsd && Number.isFinite(amtNum) && amtNum > 0
      ? formatUsd(amtNum * ethUsd)
      : null;

  return (
    <>
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
                <StatusPill tone="lime">Live</StatusPill>
                <p className="mt-2 font-display text-xl text-foreground sm:text-2xl">
                  Send ETH
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
                      setAmount(
                        maxEth === "<0.0001" ? "0" : maxEth.replace(/,/g, "")
                      )
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
                {usdHint && (
                  <p className="mt-1.5 text-xs text-mute">≈ {usdHint}</p>
                )}
              </div>

              <p className="text-sm text-mute">
                Public transfer on testnet. Anyone can see it on the explorer.
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
                      ? "Sending…"
                      : "Send"}
                </button>
              )}

              {(formError || sendError) && (
                <p role="alert" className="text-sm text-red-500">
                  {formError || sendError?.message.slice(0, 160)}
                </p>
              )}

              {hash && !isSuccess && (
                <p className="text-sm text-mute">
                  Submitted…{" "}
                  <a
                    href={EXPLORER_TX(hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-lime hover:underline"
                  >
                    View tx
                  </a>
                </p>
              )}
            </form>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
              Balance
            </p>
            <p className="mt-2 font-display text-3xl text-foreground">
              {isConnected ? formatEth(bal?.value ?? BigInt(0)) : "—"}{" "}
              <span className="text-lg text-mute">ETH</span>
            </p>
            {ethUsd && bal && (
              <p className="mt-1 text-sm text-mute">
                ≈{" "}
                {formatUsd(
                  (Number(bal.value) / 1e18) * ethUsd
                )}
              </p>
            )}
          </div>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-lime/40"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
              Need more ETH?
            </p>
            <p className="mt-2 text-sm text-mute">Open the free testnet faucet →</p>
          </a>
        </aside>
      </div>

      <SuccessModal
        open={showSuccess && Boolean(hash)}
        title="Sent"
        body={
          <>
            <p>
              <span className="text-foreground font-medium">
                {sentAmount || "—"} ETH
              </span>{" "}
              went to{" "}
              <span className="font-mono text-foreground">
                {to ? shortAddress(to, 5) : "—"}
              </span>
              .
            </p>
            <p className="mt-2">Settled on Robinhood testnet.</p>
          </>
        }
        primaryHref={hash ? EXPLORER_TX(hash) : undefined}
        primaryLabel="View on explorer"
        secondaryLabel="Send more"
        onClose={() => {
          setShowSuccess(false);
          setAmount("");
        }}
      />
    </>
  );
}
