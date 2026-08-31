import Image from "next/image";

/**
 * Twilight treatment: dithered art reads as charcoal ink on paper with a faint
 * indigo cast (no more lime-on-black).
 * plate – dark source (white on black) → inverted to ink on paper
 * ink   – paper source (dark on light) → kept, just desaturated
 * raw   – untouched
 */
export type AsciiTone = "plate" | "ink" | "raw";

export function AsciiImage({
  src,
  alt,
  tone = "plate",
  className = "",
  priority = false,
  sizes = "100vw",
  fit = "cover",
}: {
  src: string;
  alt: string;
  tone?: AsciiTone;
  className?: string;
  priority?: boolean;
  sizes?: string;
  fit?: "cover" | "contain";
}) {
  const fitClass =
    fit === "contain"
      ? "object-contain object-center"
      : "object-cover object-center";

  return (
    <div className={`relative overflow-hidden bg-[#EAE8E1] ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={`${fitClass} ${
          tone === "plate"
            ? "ascii-plate"
            : tone === "ink"
              ? "ascii-ink"
              : ""
        }`}
      />
      {(tone === "plate" || tone === "ink") && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{ backgroundColor: "#3B3766", opacity: 0.16 }}
          aria-hidden
        />
      )}
    </div>
  );
}
