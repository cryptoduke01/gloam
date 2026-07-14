import Link from "next/link";
import { Header } from "./Header";
import { Footer } from "./Footer";

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
    <>
      <Header />
      <main className="mx-auto max-w-3xl flex-1 px-5 py-14 sm:px-8">
        <p className="text-xs uppercase tracking-[0.16em] text-mute">Legal</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-mute">Last updated {updated}</p>
        <div className="prose-legal mt-10 space-y-6 text-[15px] leading-relaxed text-mute">
          {children}
        </div>
        <p className="mt-12 text-sm">
          <Link href="/" className="text-lime hover:underline">
            ← Back to home
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
