"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getConsent, setConsent, type ConsentValue } from "@/lib/consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  const accept = (value: ConsentValue) => {
    setConsent(value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel/95 p-4 backdrop-blur-md sm:p-5"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-mute">
          We use essential cookies to run the site. Optional first-party
          analytics load only if you allow them. No third-party trackers by
          default. See{" "}
          <Link
            href="/cookies"
            className="text-lime underline-offset-2 hover:underline"
          >
            Cookies
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-lime underline-offset-2 hover:underline"
          >
            Privacy
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => accept("essential")}
            className="min-h-10 rounded-md border border-line px-4 text-sm text-foreground hover:border-mute"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => accept("all")}
            className="min-h-10 rounded-md bg-lime px-4 text-sm font-medium text-black hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
