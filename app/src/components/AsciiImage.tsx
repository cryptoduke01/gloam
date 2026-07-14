import Image from "next/image";

/**
 * Straight asset plate. No green filters, no blend layers, no background removal.
 */
export function AsciiImage({
  src,
  alt,
  className = "",
  priority = false,
  sizes = "100vw",
  fit = "cover",
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  fit?: "cover" | "contain";
}) {
  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={
          fit === "contain"
            ? "object-contain object-center"
            : "object-cover object-center"
        }
      />
    </div>
  );
}
