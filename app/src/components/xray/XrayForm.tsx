"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseXrayQuery } from "@/lib/xray/input";

/** One field and one button. The wallet goes into the path, and from there only to the read. */
export function XrayForm({ className = "", autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = parseXrayQuery(value);
    if (query.kind === "invalid") {
      setWrong(true);
      return;
    }
    router.push(`/xray/${query.kind === "address" ? query.address : query.name}`);
  };

  return (
    <form onSubmit={submit} noValidate className={className}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          aria-label="Wallet address or ENS name"
          aria-invalid={wrong}
          aria-describedby={wrong ? "xray-input-error" : undefined}
          className="gl-input min-w-0 sm:flex-1"
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="0x address or name.eth"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
        />
        <button type="submit" className="btn btn-ink btn-lg shrink-0">
          See what is public
        </button>
      </div>
      {wrong && (
        <p id="xray-input-error" role="alert" className="mt-3 text-[14px] text-danger">
          That is not a wallet address or an .eth name.
        </p>
      )}
    </form>
  );
}
