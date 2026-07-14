import Image from "next/image";
import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime ${className}`}
    >
      <Image
        src="/brand/logo.png"
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-md"
        priority
      />
      <span className="font-display text-xl tracking-tight text-white">
        Gloam
      </span>
    </Link>
  );
}
