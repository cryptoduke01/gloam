"use client";

import { useEffect, useState } from "react";
import { getAddress, isAddressEqual, recoverMessageAddress } from "viem";
import { GLOAM_OWNER, OWNERSHIP_STATEMENT } from "@/lib/contractDirectory";
import { CheckMark, CopyButton } from "./VerifyBits";

type Check = { status: "checking" } | { status: "ok" } | { status: "bad"; signer: string | null };

/**
 * The owner's signed statement naming Gloam's addresses (OWNERSHIP_STATEMENT
 * in lib/contractDirectory), checked in the browser: the signature has to
 * recover to the owner address the vaults name. Until the owner signs one,
 * this says so plainly.
 */
export function OwnershipStatement() {
  const s = OWNERSHIP_STATEMENT;
  const [check, setCheck] = useState<Check>({ status: "checking" });

  useEffect(() => {
    if (!s) return;
    let gone = false;
    recoverMessageAddress({ message: s.message, signature: s.signature })
      .then((signer) => {
        if (!gone) setCheck(isAddressEqual(signer, GLOAM_OWNER) ? { status: "ok" } : { status: "bad", signer: getAddress(signer) });
      })
      .catch(() => {
        if (!gone) setCheck({ status: "bad", signer: null });
      });
    return () => {
      gone = true;
    };
  }, [s]);

  if (!s) {
    return (
      <div className="rounded-[18px] border border-dashed border-line-strong p-5 sm:p-6">
        <p className="text-[15px] text-foreground">Not published yet</p>
        <p className="mt-1.5 max-w-[56ch] text-[14px] leading-relaxed text-mute">
          The owner wallet will sign a short statement naming these addresses. It will show here with its signature,
          and this page will check in your browser that the owner signed it.
        </p>
      </div>
    );
  }

  return (
    <div className="gl-card p-5 sm:p-6">
      <div aria-live="polite" className="flex items-center gap-2 text-[14px]">
        {check.status === "checking" && <span className="text-mute">Checking the signature…</span>}
        {check.status === "ok" && (
          <>
            <span className="text-sealed">
              <CheckMark size={15} />
            </span>
            <span className="text-foreground">Signed by the owner, {GLOAM_OWNER}</span>
          </>
        )}
        {check.status === "bad" && (
          <span className="text-warn">
            {check.signer ? `This signature is from ${check.signer}, not the owner.` : "This signature could not be read."}
          </span>
        )}
      </div>
      <pre className="tnum mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface p-4 text-[13px] leading-relaxed text-soft">
        {s.message}
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] text-mute">Signed {s.signedOn}</span>
        <CopyButton value={s.message} label="statement" />
        <CopyButton value={s.signature} label="signature" />
      </div>
    </div>
  );
}
