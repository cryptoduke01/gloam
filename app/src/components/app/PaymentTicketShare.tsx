"use client";

/**
 * Share a Gloam payment ticket — not a wallet address.
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
          setQrError("QR unavailable — copy the code instead.");
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
        title: "Gloam payment ticket",
        text: locked
          ? `Gloam vault payment${amountLabel ? ` (${amountLabel} ETH)` : ""}. Code is locked — ask me for the passphrase separately.\n\n${code}`
          : `Gloam vault payment${amountLabel ? ` (${amountLabel} ETH)` : ""}. Claim under Move → Claim ticket.\n\n${code}`,
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
          ? "Your receive tag"
          : "Payment package ready"}
        {amountLabel ? ` · ${amountLabel} ETH` : ""}
        {locked ? " · encrypted" : ""}
      </p>
      <p className="mt-1 text-xs text-mute">
        {code.startsWith("gloamr1.") ? (
          <>
            Share this tag so others can{" "}
            <strong className="text-foreground">Private pay → Direct</strong>{" "}
            to you. Not a public chain address.
          </>
        ) : (
          <>
            Hand off off-app (message, AirDrop, QR). They open{" "}
            <strong className="text-foreground">Move → Receive</strong>.
            {locked
              ? " Encrypted — only the intended key/passphrase opens it."
              : " Bearer ticket — treat like cash."}
          </>
        )}
      </p>

      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="Payment ticket QR"
            className="h-[140px] w-[140px] shrink-0 rounded-lg border border-line bg-white p-1"
          />
        ) : (
          <div className="flex h-[140px] w-[140px] shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-[10px] text-mute">
            {qrError ?? "QR…"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="max-h-28 overflow-y-auto break-all rounded-lg border border-line bg-panel p-3 font-mono text-[10px] text-mute">
            {code}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-lime/40 text-sm font-medium text-lime hover:bg-lime/10"
            >
              {copied ? "Copied" : "Copy ticket"}
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
                className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-lime text-sm font-semibold text-black"
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
