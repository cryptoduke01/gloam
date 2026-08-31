"use client";

import { useEffect, useState } from "react";
import { getConsent, setConsent, type ConsentValue } from "@/lib/consent";

export function CookiePreferences() {
  const [current, setCurrent] = useState<ConsentValue | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCurrent(getConsent());
  }, []);

  const save = (value: ConsentValue) => {
    setConsent(value);
    setCurrent(value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <p className="text-sm text-mute">
        Current choice:{" "}
        <span className="text-foreground">
          {current === "all"
            ? "All (analytics on)"
            : current === "essential"
              ? "Essential only"
              : "Not set"}
        </span>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save("essential")}
          className="min-h-10 rounded-md border border-line px-4 text-sm text-foreground hover:border-mute"
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => save("all")}
          className="min-h-10 rounded-md bg-lime px-4 text-sm font-medium text-background hover:opacity-90"
        >
          Accept analytics
        </button>
      </div>
      {saved && (
        <p className="mt-3 text-sm text-lime" role="status">
          Preferences saved.
        </p>
      )}
    </div>
  );
}
