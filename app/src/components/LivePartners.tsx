import Image from "next/image";

/**
 * Partners already live on Gloam: a plain logo row on the landing page and /partners.
 * Raeto and Agent Wormhole are drawn inline so they follow the theme: Raeto's ring
 * takes the text colour, Agent Wormhole keeps its own dark disc. Zedkr's mark is a
 * rendered file, so it ships as its own black and white PNGs and the theme picks
 * one. Static copies of all three live in public/brand/partners.
 */

/** Raeto's mark: an open ring, a centre dot and the green dot in the gap. */
export function RaetoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="240 240 540 540" aria-hidden>
      <path
        d="M700 497A200 200 0 1 1 643.9 358.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="76"
        strokeLinecap="round"
      />
      <circle cx="500" cy="497" r="61" fill="currentColor" />
      <circle cx="709" cy="367" r="57" fill="#2E6B47" />
    </svg>
  );
}

/** Agent Wormhole's mark: white rings drawn off-axis on a dark disc, edged in the text colour so it holds on dark grounds. */
export function AgentWormholeMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="aw-disc" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#2A2E37" />
          <stop offset="1" stopColor="#0D0F14" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#aw-disc)" />
      <circle cx="32" cy="32" r="31.2" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.6" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="2.1">
        <circle cx="31.2" cy="31.2" r="22.5" />
        <circle cx="32.9" cy="32.9" r="17.6" />
        <circle cx="34.5" cy="34.5" r="13" />
        <circle cx="36" cy="36" r="8.8" />
        <circle cx="37.3" cy="37.3" r="5" />
      </g>
      <circle cx="38.4" cy="38.4" r="2" fill="#FFFFFF" />
    </svg>
  );
}

/** Zedkr's mark: their own files from zedkr.finance, black on light and white on dark. */
export function ZedkrMark({ size = 40 }: { size?: number }) {
  const width = Math.round((size * 230) / 256);
  return (
    <>
      <Image src="/brand/partners/zedkr-mark.png" alt="" width={width} height={size} className="block dark:hidden" />
      <Image src="/brand/partners/zedkr-mark-white.png" alt="" width={width} height={size} className="hidden dark:block" />
    </>
  );
}

type Partner = {
  name: string;
  href: string;
  /** One short line, shown on /partners only. */
  line: string;
  Mark: (p: { size?: number }) => React.JSX.Element;
};

export const LIVE_PARTNERS: Partner[] = [
  { name: "Raeto", href: "https://raeto.cc", line: "Private agent funding", Mark: RaetoMark },
  { name: "Agent Wormhole", href: "https://agentwormhole.com", line: "Agent payments checked before they go", Mark: AgentWormholeMark },
  { name: "Zedkr", href: "https://zedkr.finance", line: "Shop Amazon and eBay from a private balance", Mark: ZedkrMark },
];

function PartnerLink({ p, withLine = false, size = 32 }: { p: Partner; withLine?: boolean; size?: number }) {
  return (
    <a
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-center gap-3 rounded-lg text-foreground transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <p.Mark size={size} />
      <span>
        <span className={`block leading-tight tracking-[-0.01em] ${size > 32 ? "text-[19px]" : "text-[17px]"}`}>{p.name}</span>
        {withLine && <span className="mt-0.5 block text-[13px] text-mute">{p.line}</span>}
      </span>
    </a>
  );
}

/**
 * Landing page, right under the hero: who already runs on Gloam. A quiet line
 * and the real marks, centred on the page, so a short list sits balanced and a
 * longer one wraps into centred rows the same way.
 */
export function LivePartnersStrip() {
  return (
    <section aria-labelledby="partners" className="mx-auto max-w-[1400px] px-4 pt-16 sm:px-7 sm:pt-24">
      <h2 id="partners" className="text-center text-[14px] text-mute">
        Live with Gloam
      </h2>
      <ul className="mx-auto mt-6 flex max-w-[960px] flex-wrap items-center justify-center gap-x-12 gap-y-6 sm:mt-8 sm:gap-x-20">
        {LIVE_PARTNERS.map((p) => (
          <li key={p.name}>
            <PartnerLink p={p} size={40} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /partners: the same row, with one short line under each name. */
export function LivePartnersSection() {
  return (
    <section aria-labelledby="already-live" className="mx-auto max-w-[1240px] px-6 pt-20 sm:pt-28">
      <h2 id="already-live" className="text-[14px] text-mute">
        Already live with Gloam
      </h2>
      <ul className="mt-5 flex flex-wrap items-center gap-x-12 gap-y-5">
        {LIVE_PARTNERS.map((p) => (
          <li key={p.name}>
            <PartnerLink p={p} withLine />
          </li>
        ))}
      </ul>
    </section>
  );
}
