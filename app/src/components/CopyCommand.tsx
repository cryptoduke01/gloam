"use client";

import { useState } from "react";

/** A copyable shell command in the brand font — no monospace, no overflow. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center gap-3 rounded-[12px] border border-[#E5E3DD] bg-white/70 px-4 py-3 text-left text-[14.5px] text-[#121316] transition-colors hover:border-[#cfccc4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
    >
      <span aria-hidden className="select-none font-medium text-[#3B3766]">
        $
      </span>
      <span className="min-w-0 flex-1 truncate">{command}</span>
      <span className="shrink-0 border-l border-[#E5E3DD] pl-3 text-[12.5px] font-medium text-[#6E6E76] group-hover:text-[#121316]">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
