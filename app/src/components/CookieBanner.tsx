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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E5E3DD] bg-[#F4F3EF]/95 p-4 backdrop-blur-md sm:p-5"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-[#565660]">
          We use essential cookies to run the site. Optional first-party
          analytics load only if you allow them. No third-party trackers by
          default. See{" "}
          <Link
            href="/cookies"
            className="text-[#3B3766] underline-offset-2 hover:underline"
          >
            Cookies
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-[#3B3766] underline-offset-2 hover:underline"
          >
            Privacy
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => accept("essential")}
            className="min-h-10 rounded-[10px] border border-[#E5E3DD] px-4 text-sm text-[#121316] hover:border-[#cfccc4]"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => accept("all")}
            className="min-h-10 rounded-[10px] bg-[#121316] px-4 text-sm font-semibold text-[#F4F3EF] hover:bg-black"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
