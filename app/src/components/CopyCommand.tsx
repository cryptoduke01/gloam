"use client";

import { useState } from "react";

/** A copyable shell command, styled for the marketing surfaces. */
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
      className="group inline-flex max-w-full items-center gap-3 rounded-[12px] border border-[#E5E3DD] bg-white/70 px-4 py-3 text-left font-mono text-[13.5px] text-[#121316] transition-colors hover:border-[#cfccc4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
    >
      <span className="select-none text-[#3B3766]">$</span>
      <span className="truncate">{command}</span>
      <span className="ml-1 shrink-0 border-l border-[#E5E3DD] pl-3 text-[12px] font-medium text-[#6E6E76] group-hover:text-[#121316]">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
