import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#F4F3EF] px-6 text-center text-[#121316]">
      <div className="twilight-atmos pointer-events-none fixed inset-0 z-0" aria-hidden />
      <div className="relative z-10">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#3B3766]">
          Error 404
        </p>
        <h1 className="mt-4 text-[clamp(64px,14vw,140px)] font-bold leading-none tracking-[-0.04em]">
          404
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[17px] text-[#565660]">
          This page settled somewhere the chain can&apos;t see. Nothing to
          reveal here.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-[#121316] px-[22px] text-[15px] font-semibold text-[#F4F3EF] transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B3766]"
          >
            Back to home →
          </Link>
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center rounded-[12px] border border-[#E5E3DD] bg-white/60 px-[22px] text-[15px] font-semibold text-[#121316] transition-colors hover:border-[#cfccc4]"
          >
            Open the vault
          </Link>
        </div>
      </div>
    </div>
  );
}
