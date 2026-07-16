"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background px-5 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
        Admin
      </p>
      <h1 className="font-display text-3xl text-foreground">Something broke</h1>
      <p className="max-w-md text-sm text-mute">
        {error.message || "The admin console crashed while loading."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-black"
      >
        Try again
      </button>
    </div>
  );
}
