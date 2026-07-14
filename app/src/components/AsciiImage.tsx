import Image from "next/image";

/**
 * plate – dark ASCII (white on black) → brand lime via multiply
 * ink   – paper ASCII (dark on light) → invert then same lime multiply (matches plate)
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
    <div className={`relative overflow-hidden bg-black ${className}`}>
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
          style={{ backgroundColor: "#c8ff00", opacity: 0.7 }}
          aria-hidden
        />
      )}
    </div>
  );
}
