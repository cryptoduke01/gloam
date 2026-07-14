import Image from "next/image";

/**
 * plate  – dark ASCII (white dots on black) → lime via multiply
 * ink    – light paper ASCII (brown/blue on white) → lime ink wash
 * raw    – no color treatment
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
    fit === "contain" ? "object-contain object-center" : "object-cover object-center";

  return (
    <div
      className={`relative overflow-hidden ${
        tone === "ink" ? "bg-white dark:bg-[#0a0a0a]" : "bg-ink"
      } ${className}`}
    >
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
      {tone === "plate" && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-[0.68] dark:opacity-[0.72]"
          style={{ backgroundColor: "#c8ff00" }}
          aria-hidden
        />
      )}
    </div>
  );
}
