"use client";

/**
 * Share a Gloam payment ticket, not a wallet address.
 * QR is generated locally so the ticket never hits a third-party API.
 */

import { useEffect, useState } from "react";

export function PaymentTicketShare({
  code,
  amountLabel,
  locked,
}: {
  code: string;
  amountLabel?: string | null;
  locked: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(null);
    void (async () => {
      try {
        const QR = await import("qrcode");
        const url = await QR.toDataURL(code, {
          margin: 2,
          width: 220,
          errorCorrectionLevel: "M",
          color: { dark: "#0a0a0a", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) {
          setQrError("QR code not available. Copy the code instead.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* parent may surface */
    }
  }

  function downloadTxt() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gloam-ticket-${amountLabel?.replace(/\s/g, "") ?? "pay"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function nativeShare() {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: "Gloam payment",
        text: locked
          ? `Gloam private payment${amountLabel ? ` (${amountLabel} ETH)` : ""}. This is locked. Ask me for the passphrase separately.\n\n${code}`
          : `Gloam private payment${amountLabel ? ` (${amountLabel} ETH)` : ""}. To claim, open Move, then Claim.\n\n${code}`,
      });
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* user cancelled */
    }
  }

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="rounded-xl border border-lime/30 bg-lime/5 p-4">
      <p className="text-sm font-medium text-foreground">
        {code.startsWith("gloamr1.")
          ? "Your Gloam address"
          : "Claim link ready"}
        {amountLabel ? ` · ${amountLabel} ETH` : ""}
        {locked ? " · locked" : ""}
      </p>
      <p className="mt-1 text-xs text-mute">
        {code.startsWith("gloamr1.") ? (
          <>
            Share this address so others can{" "}
            <strong className="text-foreground">Private pay → Direct</strong>{" "}
            to you. It is not a public wallet address.
          </>
        ) : (
          <>
            Send it any way you like (message, AirDrop, QR). They open{" "}
            <strong className="text-foreground">Move → Receive</strong>.
            {locked
              ? " It is locked. Only the right passphrase opens it."
              : " Anyone with this link can claim it, so treat it like cash."}
          </>
        )}
      </p>

      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="Payment QR code"
            className="h-[140px] w-[140px] shrink-0 rounded-lg border border-line bg-white p-1"
          />
        ) : (
          <div className="flex h-[140px] w-[140px] shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-[10px] text-mute">
            {qrError ?? "QR…"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="max-h-28 overflow-y-auto break-all rounded-lg border border-line bg-panel p-3 text-[10px] text-mute">
            {code}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-lime/40 text-sm font-medium text-lime hover:bg-lime/10"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <button
              type="button"
              onClick={downloadTxt}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line text-sm font-medium text-foreground hover:border-mute"
            >
              Download
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() => void nativeShare()}
                className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-background"
              >
                {shared ? "Shared" : "Share…"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
