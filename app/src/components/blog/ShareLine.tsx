"use client";

import { useEffect, useState } from "react";

function XMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.2h1.7L7.4 4.7H5.57l11.1 14.5z" />
    </svg>
  );
}

function LinkMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 14a4.5 4.5 0 0 0 6.36 0l3.18-3.18a4.5 4.5 0 0 0-6.36-6.36L11.6 6.04M14 10a4.5 4.5 0 0 0-6.36 0l-3.18 3.18a4.5 4.5 0 0 0 6.36 6.36l1.58-1.58"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const item =
  "inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[14px] text-soft transition-colors hover:bg-surface hover:text-foreground";

/** Share a post: on X, or copy its link. */
export function ShareLine({ title, url, className = "" }: { title: string; url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard blocked: the link is still in the address bar */
    }
  };

  const intent = `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span className="mr-2 text-[14px] text-mute">Share</span>
      <a href={intent} target="_blank" rel="noreferrer" className={item}>
        <XMark /> Post on X
      </a>
      <button type="button" onClick={onCopy} className={item} aria-live="polite">
        <LinkMark /> {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
