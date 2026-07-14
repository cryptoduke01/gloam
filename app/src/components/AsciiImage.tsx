import Image from "next/image";

type Tone = "lime" | "white" | "paper";

/**
 * lime  — dark ASCII (white dots on black) recolored to brand lime via multiply
 * white — monochrome light on black, no green
 * paper — classical line art on light ground (statues); soft lime wash, not neon
 */
export function AsciiImage({
  src,
  alt,
  tone = "lime",
  className = "",
  priority = false,
  sizes = "100vw",
}: {
  src: string;
  alt: string;
  tone?: Tone;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (tone === "paper") {
    return (
      <div className={`relative overflow-hidden bg-[#0c0c0c] ${className}`}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          className="object-contain object-center p-4 sm:p-6"
        />
        {/* Soft brand wash — not a thick neon filter */}
        <div
          className="pointer-events-none absolute inset-0 mix-blend-color"
          style={{ backgroundColor: "rgba(200, 255, 0, 0.28)" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-ink/20" aria-hidden />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={`object-cover object-center ${
          tone === "white" ? "ascii-white" : "ascii-base"
        }`}
      />
      {tone === "lime" && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{ backgroundColor: "#c8ff00", opacity: 0.72 }}
          aria-hidden
        />
      )}
    </div>
  );
}
