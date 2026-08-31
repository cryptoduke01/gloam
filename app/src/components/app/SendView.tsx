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
import {
  EXPLORER_TX,
  PRODUCT_CHAIN_ID,
  formatEth,
  shortAddress,
} from "@/lib/chain";
import { safeParseEther } from "@/lib/amount";
import { useEthPrice } from "@/hooks/useLiveMarkets";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { formatUsd } from "@/lib/markets";
import { WalletMenu } from "./WalletMenu";
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

    // Fast send: go straight to wallet (still needs one signature, non-custodial)
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
      <div className="mx-auto max-w-xl space-y-4">
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-line bg-panel p-6"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-mute">
                You&apos;re sending
              </span>
              <span className="text-[11px] text-mute">On Robinhood testnet</span>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <input
                id="send-amount"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight text-foreground outline-none placeholder:text-mute/40"
                aria-label="Amount to send"
              />
              <span className="shrink-0 rounded-xl border border-line bg-background px-4 py-2.5 text-sm font-semibold text-foreground">
                ETH
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-mute">{usdHint ? `≈ ${usdHint}` : ""}</span>
              <button
                type="button"
                disabled={!isConnected}
                onClick={() =>
                  setAmount(maxEth === "<0.0001" ? "0" : maxEth.replace(/,/g, ""))
                }
                className="text-mute transition-colors hover:text-foreground disabled:opacity-40"
              >
                Balance: {isConnected ? maxEth : "0"} ETH ·{" "}
                <span className="font-medium text-lime">Max</span>
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="send-to"
              className="text-[11px] uppercase tracking-[0.16em] text-mute"
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
              className="mt-2 min-h-12 w-full rounded-xl border border-line bg-background px-4 text-sm text-foreground outline-none placeholder:text-mute focus:border-lime"
            />
          </div>

          {validPreview && (
            <div className="rounded-xl border border-line bg-background/40 px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-mute">Sending</span>
                <span className="font-medium text-foreground">
                  {amount} ETH{usdHint ? ` · ${usdHint}` : ""}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-mute">To</span>
                <span className="text-foreground">{shortAddress(to, 6)}</span>
              </div>
            </div>
          )}

          {!isConnected || !onProduct ? (
            <WalletMenu />
          ) : (
            <button
              type="submit"
              disabled={isPending || confirming}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60"
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
            <p role="alert" className="text-sm text-[#c0432f]">
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
                    <dd className="text-foreground">{shortAddress(to, 6)}</dd>
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
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background hover:opacity-90"
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
                {sentAmount || "0"} ETH
              </span>{" "}
              to{" "}
              <span className="text-foreground">
                {sentTo ? shortAddress(sentTo, 5) : ""}
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
