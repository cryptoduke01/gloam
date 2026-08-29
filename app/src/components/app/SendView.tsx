"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useChainId,
} from "wagmi";
import { isAddress } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
  shortAddress,
} from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { FAUCET_URL } from "@/lib/faucet";
import { useEthPrice } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatUsd } from "@/lib/markets";
import { WalletMenu } from "./WalletMenu";
import { StatusPill } from "./StatusPill";
import { SuccessModal } from "./SuccessModal";

export function SendView() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onProduct = chainId === PRODUCT_CHAIN_ID;
  const { ethUsd } = useEthPrice();
  const { settings } = useTradingSettings();
  const { data: bal, refetch } = useBalance({
    address,
    chainId: PRODUCT_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sentAmount, setSentAmount] = useState("");
  const [sentTo, setSentTo] = useState("");

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

  const handledHash = useRef<string | null>(null);

  useEffect(() => {
    if (!isSuccess || !hash) return;
    if (handledHash.current === hash) return;
    handledHash.current = hash;
    void refetch();
    if (settings.confirmSends) setShowSuccess(true);
  }, [isSuccess, hash, refetch, settings.confirmSends]);

  function validate(): string | null {
    if (!isConnected || !onProduct) {
      return "Connect and switch to testnet.";
    }
    if (!isAddress(to)) return "Enter a valid address.";
    const value = safeParseEther(amount || "0");
    if (value === null) return "Invalid amount.";
    if (value <= BigInt(0)) return "Amount must be greater than zero.";
    if (bal && value > bal.value) return "Not enough testnet ETH.";
    return null;
  }

  function executeSend() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    const value = safeParseEther(amount);
    if (value === null) {
      setFormError("Invalid amount.");
      return;
    }
    setFormError(null);
    setShowPreview(false);
    reset();
    setShowSuccess(false);
    handledHash.current = null;
    setSentAmount(amount);
    setSentTo(to);
    sendTransaction({
      to: to as `0x${string}`,
      value,
      chainId: PRODUCT_CHAIN_ID,
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);

    // Fast send: go straight to wallet (still needs one signature — non-custodial)
    if (settings.fastSend) {
      executeSend();
      return;
    }
    setShowPreview(true);
  }

  const maxEth = bal ? formatEth(bal.value, 6) : "0";
  const amtNum = Number(amount);
  const usdHint =
    ethUsd && Number.isFinite(amtNum) && amtNum > 0
      ? formatUsd(amtNum * ethUsd)
      : null;
  const validPreview = !validate() && isAddress(to) && amtNum > 0;

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
              <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/80 to-panel/40" />
              <div className="absolute bottom-4 left-5">
                <StatusPill tone="lime">
                  {settings.fastSend ? "Fast mode" : "Live"}
                </StatusPill>
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
                  className="mt-2 min-h-12 w-full rounded-md border border-line bg-transparent px-4 text-sm text-foreground outline-none placeholder:text-mute focus:border-lime"
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
                    Max {isConnected ? maxEth : "—"}
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
                  <span className="flex items-center border-l border-line px-4 text-sm text-mute">
                    ETH
                  </span>
                </div>
                {usdHint && (
                  <p className="mt-1.5 text-xs text-mute">≈ {usdHint}</p>
                )}
              </div>

              {/* Live preview card */}
              {validPreview && (
                <div className="rounded-xl border border-lime/30 bg-background px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-lime">
                    Preview
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <p className="font-display text-2xl text-foreground">
                      {amount} ETH
                    </p>
                    {usdHint && (
                      <p className="text-sm text-mute">{usdHint}</p>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-mute">
                    → {shortAddress(to, 6)}
                  </p>
                  <p className="mt-2 text-xs text-mute">
                    {settings.fastSend
                      ? "Fast mode: wallet confirms once, then settles."
                      : "Review, then confirm in your wallet."}
                  </p>
                </div>
              )}

              {!isConnected || !onProduct ? (
                <WalletMenu />
              ) : (
                <button
                  type="submit"
                  disabled={isPending || confirming}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
                >
                  {isPending
                    ? "Confirm in wallet…"
                    : confirming
                      ? "Sending…"
                      : settings.fastSend
                        ? "Send now"
                        : "Review & send"}
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
            <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
              Balance
            </p>
            <p className="mt-2 font-display text-3xl text-foreground">
              {isConnected ? formatEth(bal?.value ?? BigInt(0)) : "—"}{" "}
              <span className="text-lg text-mute">ETH</span>
            </p>
            {ethUsd && bal && (
              <p className="mt-1 text-sm text-mute">
                ≈ {formatUsd((Number(bal.value) / 1e18) * ethUsd)}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-line bg-panel p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
              Mode
            </p>
            <p className="mt-2 text-sm text-foreground">
              {settings.fastSend ? "Fast send on" : "Review before send"}
            </p>
            <p className="mt-1 text-xs text-mute">
              Change in Settings. Wallet still signs once — we never hold your
              keys.
            </p>
          </div>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-lime/40"
          >
            <p className="text-[10px] uppercase tracking-[0.14em] text-lime">
              Need more ETH?
            </p>
            <p className="mt-2 text-sm text-mute">Open faucet →</p>
          </a>
        </aside>
      </div>

      {/* Review modal (portaled so AppShell animations cannot offset it) */}
      {showPreview &&
        createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            aria-label="Close"
            onClick={() => setShowPreview(false)}
          />
          <div className="relative z-[1] w-full max-w-sm max-h-[min(90vh,640px)] overflow-y-auto overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="h-1 bg-lime" />
            <div className="px-6 py-6">
              <p className="text-[10px] uppercase tracking-[0.16em] text-lime">
                Review
              </p>
              <h2 className="mt-2 font-display text-2xl text-foreground">
                Confirm send
              </h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-line pb-2">
                  <dt className="text-mute">Amount</dt>
                  <dd className="font-medium text-foreground">
                    {amount} ETH
                    {usdHint ? (
                      <span className="ml-1 text-mute">({usdHint})</span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-line pb-2">
                  <dt className="text-mute">To</dt>
                  <dd className="text-foreground">
                    {shortAddress(to, 6)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mute">Network</dt>
                  <dd className="text-foreground">Robinhood testnet</dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={executeSend}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black hover:opacity-90"
                >
                  Confirm in wallet
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line text-sm text-mute hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <SuccessModal
        open={showSuccess && Boolean(hash)}
        title="Sent"
        body={
          <>
            <p>
              <span className="font-medium text-foreground">
                {sentAmount || "—"} ETH
              </span>{" "}
              to{" "}
              <span className="text-foreground">
                {sentTo ? shortAddress(sentTo, 5) : "—"}
              </span>
            </p>
            <p className="mt-2">Settled on testnet.</p>
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
