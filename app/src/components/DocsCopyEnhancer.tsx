"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

/**
 * Adds a copy button to every code block in the docs prose. The docs pages are
 * server-rendered `<pre><code>` blocks, so this client enhancer injects the
 * control after mount and re-runs on navigation.
 */
export function DocsCopyEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    const pres = document.querySelectorAll<HTMLPreElement>(".docs-prose pre");
    const added: HTMLButtonElement[] = [];

    pres.forEach((pre) => {
      if (pre.querySelector(".copy-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.setAttribute("aria-label", "Copy code");
      btn.innerHTML = `${COPY_ICON}<span>Copy</span>`;

      btn.addEventListener("click", async () => {
        const code = pre.querySelector("code")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          btn.classList.add("copied");
          btn.innerHTML = `${CHECK_ICON}<span>Copied</span>`;
          window.setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = `${COPY_ICON}<span>Copy</span>`;
          }, 1500);
        } catch {
          /* clipboard unavailable */
        }
      });

      pre.appendChild(btn);
      added.push(btn);
    });

    return () => added.forEach((b) => b.remove());
  }, [pathname]);

  return null;
}
