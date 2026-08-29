import Link from "next/link";

function Mark({ size = 20 }: { size?: number }) {
  const notch = Math.round(size * 0.34);
  const off = Math.round(size * 0.27);
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 rounded-[6px] bg-[#121316]"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute rounded-[2px] bg-[#F4F3EF]"
        style={{ width: notch, height: notch, top: off, right: off }}
      />
    </span>
  );
}

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F4F3EF] text-[#121316]">
      <header className="sticky top-0 z-40 border-b border-[#E5E3DD] bg-[#F4F3EF]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-[10px]">
            <Mark size={20} />
            <span className="font-semibold tracking-[-0.01em]">Gloam</span>
          </Link>
          <Link href="/" className="text-sm text-[#6E6E76] hover:text-[#121316]">
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#3B3766]">
          Legal
        </p>
        <h1 className="mt-2 text-4xl font-bold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-[#6E6E76]">Last updated {updated}</p>
        <div className="prose-legal mt-10 space-y-6 text-[15px] leading-relaxed text-[#565660]">
          {children}
        </div>
        <p className="mt-12 text-sm">
          <Link
            href="/"
            className="text-[#3B3766] underline-offset-2 hover:underline"
          >
            ← Back to home
          </Link>
        </p>
      </main>

      <footer className="mx-auto max-w-3xl px-5 py-8 text-[12.5px] text-[#6E6E76] sm:px-8">
        <div className="flex items-center gap-[10px] border-t border-[#E5E3DD] pt-6">
          <Mark size={18} />
          <span>Gloam · Robinhood Chain</span>
        </div>
      </footer>
    </div>
  );
}
