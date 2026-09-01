import Link from "next/link";

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      style={{ flex: "none" }}
    >
      <rect width="32" height="32" rx="9" fill="#121316" />
      <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#f4f3ef" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#F4F3EF] text-[#121316]">
      <div
        className="twilight-atmos pointer-events-none fixed inset-0 z-0"
        aria-hidden
      />

      <header className="relative z-10 px-6 py-6 sm:px-10 sm:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <Mark />
          <span className="text-[19px] font-semibold tracking-tight">Gloam</span>
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#3B3766]">
          Error 404
        </p>
        <h1 className="mt-6 text-[clamp(72px,16vw,184px)] font-bold leading-[0.88] tracking-[-0.05em]">
          404
        </h1>
        <p className="mx-auto mt-6 max-w-lg text-[18px] leading-relaxed text-[#565660] sm:text-[19px]">
          This page settled somewhere the chain can&apos;t see. Nothing to reveal
          here.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center gap-2 rounded-[14px] bg-[#121316] px-6 text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
          >
            Back to home →
          </Link>
          <Link
            href="/app"
            className="inline-flex min-h-12 items-center rounded-[14px] border border-[#E5E3DD] bg-white/60 px-6 text-[15px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
          >
            Open the vault
          </Link>
        </div>
      </main>
    </div>
  );
}
