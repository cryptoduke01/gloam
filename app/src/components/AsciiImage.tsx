import Image from "next/image";

type Tone = "lime" | "white";

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
  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={`object-cover object-center ${
          tone === "lime" ? "ascii-lime" : "ascii-white"
        }`}
      />
    </div>
  );
}
