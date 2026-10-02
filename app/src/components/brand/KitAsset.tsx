import Image from "next/image";

export const KIT = "/brand/kit";

export type KitFile = { label: string; href: string };

/**
 * A small download pill. 40px tall on touch, compact from sm up. `onTile`
 * lifts it off a surface-coloured tile so it does not disappear into it.
 */
export function KitPill({
  href,
  onTile = false,
  children,
}: {
  href: string;
  onTile?: boolean;
  children: React.ReactNode;
}) {
  const tone = onTile
    ? "border border-line bg-panel hover:border-line-strong"
    : "bg-surface hover:bg-surface-2";
  return (
    <a
      href={href}
      download
      className={`inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-[12.5px] text-soft transition-colors hover:text-foreground sm:h-8 sm:px-3 ${tone}`}
    >
      {children}
    </a>
  );
}

/**
 * An asset preview that follows the page theme: the light file in light mode,
 * the dark file in dark mode. Pass only `light` for assets with one version.
 */
export function ThemedImage({
  light,
  dark,
  alt,
  width,
  height,
  sizes,
  className = "",
}: {
  light: string;
  dark?: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className?: string;
}) {
  const cls = `block h-auto w-full ${className}`;
  if (!dark) {
    return <Image src={light} alt={alt} width={width} height={height} sizes={sizes} className={cls} />;
  }
  return (
    <>
      <Image src={light} alt={alt} width={width} height={height} sizes={sizes} className={`${cls} dark:hidden`} />
      <Image src={dark} alt={alt} width={width} height={height} sizes={sizes} className={`${cls} hidden dark:block`} />
    </>
  );
}

/** A framed preview with a caption row and download pills. */
export function AssetFigure({
  title,
  meta,
  light,
  dark,
  alt,
  width,
  height,
  sizes,
  files,
  className = "",
  frameClassName = "",
}: {
  title: string;
  meta?: string;
  light: string;
  dark?: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  files: KitFile[];
  className?: string;
  frameClassName?: string;
}) {
  return (
    <figure className={`gl-tile flex flex-col overflow-hidden ${className}`}>
      <div className={`overflow-hidden border-b border-line ${frameClassName}`}>
        <ThemedImage light={light} dark={dark} alt={alt} width={width} height={height} sizes={sizes} />
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
        <span className="min-w-0">
          <span className="block text-[14px]">{title}</span>
          {meta && <span className="tnum mt-0.5 block text-[12.5px] text-mute">{meta}</span>}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <KitPill key={f.href} href={f.href} onTile>
              {f.label}
            </KitPill>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
