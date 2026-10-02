"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-16">
      <div className="gl-card w-full max-w-md p-7 text-center sm:p-9">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-danger-soft text-danger">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
          </svg>
        </span>
        <p className="t-label mt-5">Admin</p>
        <h1 className="t-display-m mt-2 text-foreground">Something broke</h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-[14px] leading-relaxed text-mute">
          {error.message || "The admin console crashed while loading."}
        </p>
        <button type="button" onClick={reset} className="btn btn-ink mt-7">
          Try again
        </button>
      </div>
    </div>
  );
}
