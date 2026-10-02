import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Mark } from "@/components/Logo";
import { SealedField } from "@/components/ui/SealedField";
import { FlowField } from "@/components/ui/FlowField";
import { SealDots } from "@/components/ui/SealDots";
import { CopyValue } from "@/components/brand/CopyValue";

export const metadata: Metadata = {
  title: "Brand",
  description:
    "The Gloam brand: the mark, colour, type, the field, illustration, voice and interface rules. Download the brand kit.",
};

const KIT = "/brand/kit";

const SECTIONS = [
  ["logo", "Logo"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["field", "The field"],
  ["illustration", "Illustration"],
  ["voice", "Voice"],
  ["interface", "Interface"],
  ["downloads", "Downloads"],
] as const;

const COLOURS: {
  name: string;
  role: string;
  hex: string;
  rgb: string;
  chip: string;
  ink?: boolean;
}[] = [
  { name: "Ink", role: "Type, primary actions, the mark", hex: "#0B0C0E", rgb: "11 12 14", chip: "#0B0C0E", ink: true },
  { name: "Paper", role: "Ground, space, calm", hex: "#FFFFFF", rgb: "255 255 255", chip: "#FFFFFF" },
  { name: "Graphite 1", role: "Surfaces, tiles, wells", hex: "#F3F4F5", rgb: "243 244 245", chip: "#F3F4F5" },
  { name: "Graphite 2", role: "Hairlines, dividers", hex: "#E4E6E9", rgb: "228 230 233", chip: "#E4E6E9" },
  { name: "Graphite 3", role: "Secondary text", hex: "#5F636A", rgb: "95 99 106", chip: "#5F636A", ink: true },
  { name: "Night", role: "Dark ground", hex: "#08090A", rgb: "8 9 10", chip: "#08090A", ink: true },
  { name: "Gloam green", role: "Private, sealed, verified, paid", hex: "#2E7D53", rgb: "46 125 83", chip: "#2E7D53", ink: true },
  { name: "Green tint", role: "Behind a sealed badge", hex: "#E6F2EA", rgb: "230 242 234", chip: "#E6F2EA" },
  { name: "Green on night", role: "The sealed signal in dark mode", hex: "#8FD3AD", rgb: "143 211 173", chip: "#8FD3AD" },
];

const SCALE = [
  { name: "Display XL", spec: "Light 300 · 88 / 1.02 · -2.8%", cls: "text-[56px] font-light leading-[1.02] tracking-[-0.028em]", sample: "Private money" },
  { name: "Display L", spec: "Light 300 · 58 / 1.06 · -2.2%", cls: "text-[40px] font-light leading-[1.06] tracking-[-0.022em]", sample: "Run payroll in one upload" },
  { name: "Display M", spec: "Light 300 · 40 / 1.1 · -1.8%", cls: "text-[30px] font-light leading-[1.1] tracking-[-0.018em]", sample: "Your private balance" },
  { name: "Title", spec: "Regular 400 · 20 / 1.3", cls: "text-[20px] leading-[1.3] tracking-[-0.01em]", sample: "October payroll, 5 people" },
  { name: "Body", spec: "Regular 400 · 15 / 1.55", cls: "text-[15px] leading-[1.55]", sample: "Gloam pays everyone from your private balance and sends each payment for you." },
  { name: "Label", spec: "Medium 500 · 11 · caps · +8%", cls: "text-[11px] font-medium uppercase tracking-[0.08em] text-mute", sample: "Private balance" },
];

const WORDS: [string, string][] = [
  ["Private balance", "Shielded note, UTXO"],
  ["Add money privately", "Shield into the pool"],
  ["Cash out", "Unshield, withdraw to EOA"],
  ["Claim link", "Bearer ticket"],
  ["Gloam address", "Receive tag, stealth meta-address"],
  ["Prove what you hold", "Selective disclosure"],
  ["Hide my wallet", "Use the relayer"],
  ["Private transfer", "Nullifier, commitment, Merkle root"],
];

const DOWNLOADS = [
  { file: "gloam-mark.svg", label: "Mark, ink", kind: "SVG" },
  { file: "gloam-mark-white.svg", label: "Mark, white", kind: "SVG" },
  { file: "gloam-mark-1024.png", label: "Mark, ink, 1024px", kind: "PNG" },
  { file: "gloam-mark-white-1024.png", label: "Mark, white, 1024px", kind: "PNG" },
  { file: "gloam-wordmark.svg", label: "Wordmark, ink", kind: "SVG" },
  { file: "gloam-wordmark-white.svg", label: "Wordmark, white", kind: "SVG" },
  { file: "gloam-wordmark-ink@4x.png", label: "Wordmark, ink, 4x", kind: "PNG" },
  { file: "gloam-wordmark-white@4x.png", label: "Wordmark, white, 4x", kind: "PNG" },
  { file: "gloam-avatar-ink.png", label: "Avatar, ink", kind: "PNG" },
  { file: "gloam-avatar-paper.png", label: "Avatar, paper", kind: "PNG" },
  { file: "gloam-x-banner.png", label: "X banner, 1500 × 500", kind: "PNG" },
  { file: "gloam-courier-etching.png", label: "The courier etching", kind: "PNG" },
];

function SectionHead({ id, title, lede }: { id: string; title: string; lede: string }) {
  return (
    <div id={id} className="scroll-mt-24 grid gap-4 border-t border-line pt-10 lg:grid-cols-[1fr_1.4fr] lg:gap-12">
      <h2 className="t-display-l">{title}</h2>
      <p className="max-w-[58ch] text-[16px] leading-relaxed text-mute lg:pt-3">{lede}</p>
    </div>
  );
}

function Download({ file, children }: { file: string; children: React.ReactNode }) {
  return (
    <a
      href={`${KIT}/${file}`}
      download
      className="inline-flex items-center gap-1.5 text-[13px] text-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
    >
      {children}
    </a>
  );
}

function Dont({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="gl-tile flex flex-col overflow-hidden">
      <div className="relative grid h-36 place-items-center">
        {children}
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-danger/70" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
          <path d="M8 92L92 8" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <figcaption className="border-t border-line px-4 py-3 text-[13px] text-soft">
        <span className="text-danger">Don&apos;t</span> {label}
      </figcaption>
    </figure>
  );
}

export default function BrandPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main>
        {/* hero */}
        <section className="mx-auto max-w-[1400px] px-4 pt-3 sm:px-7 sm:pt-6">
          <div className="gl-panel flex min-h-[520px] flex-col justify-end px-6 pb-10 pt-24 sm:px-12 sm:pb-14">
            <FlowField />
            <p className="t-label text-soft">Brand guidelines</p>
            <h1 className="t-display-xl mt-4 max-w-[12ch]">Ink, paper and one sealed window</h1>
            <p className="mt-6 max-w-[54ch] text-[16px] leading-relaxed text-soft sm:text-[17px]">
              How Gloam looks, sounds and shows up. Use these rules for anything
              with our name on it: product, decks, posts, partner pages.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <a href={`${KIT}/gloam-brand-kit.zip`} download className="btn btn-ink btn-lg">
                Download the brand kit
              </a>
              <Link href="#colour" className="btn btn-quiet btn-lg">
                Jump to colour <span aria-hidden>↓</span>
              </Link>
            </div>
          </div>
        </section>

        {/* section index */}
        <nav aria-label="Brand sections" className="mx-auto mt-6 max-w-[1240px] overflow-x-auto px-6">
          <ul className="flex gap-1.5 whitespace-nowrap pb-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex h-9 items-center rounded-full bg-surface px-3.5 text-[13px] text-soft transition-colors hover:bg-surface-2 hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-auto flex max-w-[1240px] flex-col gap-28 px-6 pb-8 pt-20">
          {/* logo */}
          <section>
            <SectionHead
              id="logo"
              title="Logo"
              lede="The mark is an ink tile with a window sealed into its corner: a balance only its owner can look into. Pair it with the wordmark in Aeonik Medium. Never redraw either."
            />
            <div className="mt-12 grid gap-3 md:grid-cols-2">
              <figure className="gl-tile flex flex-col">
                <div className="theme-light grid h-64 place-items-center rounded-t-[18px] border-b border-line bg-[#FFFFFF]">
                  <Image src={`${KIT}/gloam-wordmark.svg`} alt="Gloam wordmark in ink" width={234} height={64} className="h-16 w-auto" unoptimized />
                </div>
                <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="text-[14px]">Wordmark on paper</span>
                  <span className="flex gap-4">
                    <Download file="gloam-wordmark.svg">SVG</Download>
                    <Download file="gloam-wordmark-ink@4x.png">PNG</Download>
                  </span>
                </figcaption>
              </figure>
              <figure className="gl-tile flex flex-col">
                <div className="grid h-64 place-items-center rounded-t-[18px] bg-[#0B0C0E]">
                  <Image src={`${KIT}/gloam-wordmark-white.svg`} alt="Gloam wordmark in white" width={234} height={64} className="h-16 w-auto" unoptimized />
                </div>
                <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="text-[14px]">Wordmark on ink</span>
                  <span className="flex gap-4">
                    <Download file="gloam-wordmark-white.svg">SVG</Download>
                    <Download file="gloam-wordmark-white@4x.png">PNG</Download>
                  </span>
                </figcaption>
              </figure>
              <figure className="gl-tile flex flex-col">
                <div className="theme-light grid h-56 place-items-center rounded-t-[18px] border-b border-line bg-[#FFFFFF]">
                  <Image src={`${KIT}/gloam-mark.svg`} alt="Gloam mark in ink" width={88} height={88} unoptimized />
                </div>
                <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="text-[14px]">Mark, for small spaces and avatars</span>
                  <span className="flex gap-4">
                    <Download file="gloam-mark.svg">SVG</Download>
                    <Download file="gloam-mark-1024.png">PNG</Download>
                  </span>
                </figcaption>
              </figure>
              <figure className="gl-tile flex flex-col">
                <div className="grid h-56 place-items-center rounded-t-[18px] bg-[#0B0C0E]">
                  <Image src={`${KIT}/gloam-mark-white.svg`} alt="Gloam mark in white" width={88} height={88} unoptimized />
                </div>
                <figcaption className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span className="text-[14px]">Mark, reversed</span>
                  <span className="flex gap-4">
                    <Download file="gloam-mark-white.svg">SVG</Download>
                    <Download file="gloam-mark-white-1024.png">PNG</Download>
                  </span>
                </figcaption>
              </figure>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <div className="gl-tile flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
                <svg viewBox="-14 -14 60 60" className="h-44 w-44 shrink-0 text-foreground" aria-label="Clear space diagram">
                  <rect x="-12" y="-12" width="56" height="56" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="1.5 1.5" strokeWidth="0.4" />
                  <rect width="32" height="32" rx="9" fill="currentColor" />
                  <rect x="15" y="4" width="12" height="12" rx="3.5" fill="var(--surface)" />
                  <rect x="-12" y="-12" width="12" height="12" fill="currentColor" fillOpacity="0.08" />
                  <text x="-6" y="-4.5" textAnchor="middle" fontSize="4" fill="currentColor" fillOpacity="0.6">w</text>
                </svg>
                <div>
                  <p className="text-[17px]">Clear space</p>
                  <p className="mt-2 max-w-[38ch] text-[14px] leading-relaxed text-mute">
                    Keep a margin around the mark at least the size of its window
                    (w). Nothing else enters that space: no text, no edges, no
                    other logos.
                  </p>
                </div>
              </div>
              <div className="gl-tile flex flex-col justify-between gap-6 p-6">
                <div className="flex items-end gap-6">
                  <div className="flex flex-col items-center gap-2">
                    <Mark size={16} />
                    <span className="text-[12px] text-mute">16 px</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Image src={`${KIT}/gloam-wordmark.svg`} alt="" width={88} height={24} className="h-6 w-auto dark:invert" unoptimized />
                    <span className="text-[12px] text-mute">88 px wide</span>
                  </div>
                </div>
                <div>
                  <p className="text-[17px]">Minimum size</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">
                    Mark at 16 px, wordmark at 88 px wide. Below that, use the mark alone.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dont label="recolour the mark">
                <svg width="64" height="64" viewBox="0 0 32 32" aria-hidden>
                  <rect width="32" height="32" rx="9" fill="#2E7D53" />
                  <rect x="15" y="4" width="12" height="12" rx="3.5" fill="#fff" />
                </svg>
              </Dont>
              <Dont label="stretch or squash it">
                <svg width="96" height="52" viewBox="0 0 32 32" preserveAspectRatio="none" className="text-foreground" aria-hidden>
                  <rect width="32" height="32" rx="9" fill="currentColor" />
                  <rect x="15" y="4" width="12" height="12" rx="3.5" fill="var(--surface)" />
                </svg>
              </Dont>
              <Dont label="add glows or shadows">
                <svg width="64" height="64" viewBox="0 0 32 32" className="text-foreground drop-shadow-[0_6px_14px_rgba(46,125,83,0.9)]" aria-hidden>
                  <rect width="32" height="32" rx="9" fill="currentColor" />
                  <rect x="15" y="4" width="12" height="12" rx="3.5" fill="var(--surface)" />
                </svg>
              </Dont>
              <Dont label="rotate or move the window">
                <svg width="64" height="64" viewBox="0 0 32 32" className="rotate-12 text-foreground" aria-hidden>
                  <rect width="32" height="32" rx="9" fill="currentColor" />
                  <rect x="4" y="15" width="12" height="12" rx="3.5" fill="var(--surface)" />
                </svg>
              </Dont>
            </div>
          </section>

          {/* colour */}
          <section>
            <SectionHead
              id="colour"
              title="Colour"
              lede="Ink and paper do the work. Greys lean a degree cool so they read as chosen. One tint of Gloam green marks what is private, sealed, verified or paid, and nothing else. Hierarchy comes from value, not hue."
            />
            <div className="mt-12">
              <div className="flex h-16 overflow-hidden rounded-[18px] border border-line" role="img" aria-label="Colour proportions: paper 60, graphite 25, ink 10, green 5">
                <div className="flex w-[60%] items-end bg-[#FFFFFF] p-3 text-[12px] text-[#5F636A]">Paper 60</div>
                <div className="flex w-[25%] items-end bg-[#F3F4F5] p-3 text-[12px] text-[#5F636A]">Graphite 25</div>
                <div className="flex w-[10%] items-end bg-[#0B0C0E] p-3 text-[12px] text-white/70">Ink 10</div>
                <div className="flex w-[5%] items-end bg-[#2E7D53] p-3 text-[12px] text-white/80" title="Green 5">
                  <span className="sr-only">Green 5</span>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-mute">
                The proportions on any screen. Green stays at or under five percent: a dot, a badge, a glint, never a fill.
              </p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COLOURS.map((c) => (
                <div key={c.name} className="gl-card overflow-hidden">
                  <div className="h-28 border-b border-line" style={{ background: c.chip }} />
                  <div className="p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[17px]">{c.name}</p>
                      <CopyValue value={c.hex} className="text-[13px] text-soft" />
                    </div>
                    <p className="mt-1 text-[13px] text-mute">{c.role}</p>
                    <p className="tnum mt-3 text-[12px] text-faint">RGB {c.rgb}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="gl-tile p-6">
                <p className="t-label text-foreground">Do</p>
                <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-soft">
                  <li>Use green for a sealed dot, a &quot;Private&quot; badge, a paid check.</li>
                  <li>Let a single ink button be the loudest thing on screen.</li>
                  <li>Design light and dark as equals. Both ship.</li>
                </ul>
              </div>
              <div className="gl-tile p-6">
                <p className="t-label text-danger">Don&apos;t</p>
                <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-soft">
                  <li>Make buttons, backgrounds or headlines green.</li>
                  <li>Add blue, purple or yellow accents. Ever.</li>
                  <li>Use pure grey #808080 neutrals. Ours lean cool.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* type */}
          <section>
            <SectionHead
              id="type"
              title="Type"
              lede="One family, Aeonik, in three weights. Large type is light and quiet; emphasis comes from size and space, not weight. No monospace, anywhere: addresses and amounts use tabular figures instead."
            />
            <div className="mt-12 grid gap-3 lg:grid-cols-[1fr_1.6fr]">
              <div className="gl-tile flex flex-col justify-between p-8">
                <p className="text-[150px] font-light leading-none tracking-[-0.04em]">Aa</p>
                <div className="mt-8 space-y-2 text-[14px]">
                  <p className="flex justify-between border-t border-line pt-2"><span className="font-light">Light 300</span><span className="text-mute">Display</span></p>
                  <p className="flex justify-between border-t border-line pt-2"><span>Regular 400</span><span className="text-mute">Body</span></p>
                  <p className="flex justify-between border-t border-line pt-2"><span className="font-medium">Medium 500</span><span className="text-mute">Emphasis, labels, buttons</span></p>
                </div>
              </div>
              <div className="gl-card divide-y divide-line">
                {SCALE.map((s) => (
                  <div key={s.name} className="grid gap-2 p-5 sm:grid-cols-[150px_1fr] sm:items-baseline">
                    <div>
                      <p className="text-[13px]">{s.name}</p>
                      <p className="tnum text-[12px] text-mute">{s.spec}</p>
                    </div>
                    <p className={`${s.cls} min-w-0 truncate`}>{s.sample}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ["Sentence case", "Headlines and buttons read like sentences. No Title Case, no ALL CAPS headlines."],
                ["Numbers stay light", "Balances are set large in Light 300 with tabular figures. Never bold money."],
                ["No monospace", "Addresses, hashes and code use Aeonik. Tabular figures keep them aligned."],
              ].map(([t, b]) => (
                <div key={t} className="gl-tile p-6">
                  <p className="text-[17px]">{t}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">{b}</p>
                </div>
              ))}
            </div>
          </section>

          {/* field */}
          <section>
            <SectionHead
              id="field"
              title="The field"
              lede="Our one atmospheric device: a luminous haze inside a rounded panel. Silver by day, graphite by night, with a single green glint low in the corner. One field per view, never as a full-page background, never behind body text."
            />
            <div className="mt-12 grid gap-3 md:grid-cols-2">
              <div className="theme-light gl-panel flex h-72 items-end bg-background p-6 text-foreground">
                <SealedField />
                <span className="gl-glass px-3 py-1.5 text-[12.5px]">Light</span>
              </div>
              <div className="theme-dark gl-panel flex h-72 items-end bg-background p-6 text-foreground">
                <SealedField />
                <span className="gl-glass px-3 py-1.5 text-[12.5px]">Dark</span>
              </div>
            </div>
          </section>

          {/* illustration */}
          <section>
            <SectionHead
              id="illustration"
              title="Illustration"
              lede="Copperplate etching, two tones only: ink and paper. Wide, quiet horizons and one small human figure carrying something sealed. It says what we do without a diagram: money crossing open ground, with its contents kept private."
            />
            <figure className="gl-panel mt-12 bg-black">
              <Image
                src="/brand/kit/gloam-courier-etching.png"
                alt="The courier: an engraved desert at dusk with a lone rider carrying a sealed letter"
                width={2048}
                height={768}
                className="h-auto w-full"
                sizes="(max-width: 1240px) 100vw, 1240px"
              />
            </figure>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ["Two tones", "Pure ink on pure paper, or reversed. No grey washes, no colour, no gradients."],
                ["One small figure", "A courier, a traveller, a messenger. Small in the frame, never a hero portrait."],
                ["Where it lives", "Footers, editorial headers, social banners and decks. Not inside the product UI."],
              ].map(([t, b]) => (
                <div key={t} className="gl-tile p-6">
                  <p className="text-[17px]">{t}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">{b}</p>
                </div>
              ))}
            </div>
          </section>

          {/* voice */}
          <section>
            <SectionHead
              id="voice"
              title="Voice"
              lede="Plain, specific, calm. We say what happens to the money in words a payroll manager would use. Confidence comes from facts, not adjectives."
            />
            <div className="mt-12 grid gap-3 md:grid-cols-3">
              {[
                ["Plain", "Name things by what people recognise.", "Pay your team privately."],
                ["Specific", "Real numbers, real limits, real names.", "A private payment settles in about 8 seconds."],
                ["Calm", "No hype, no exclamation marks, no emoji.", "Nobody, including us, can move your money."],
              ].map(([t, b, ex]) => (
                <div key={t} className="gl-tile flex flex-col p-6">
                  <p className="text-[17px]">{t}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-mute">{b}</p>
                  <p className="mt-6 border-t border-line pt-4 text-[19px] font-light leading-snug tracking-[-0.01em]">&ldquo;{ex}&rdquo;</p>
                </div>
              ))}
            </div>
            <div className="gl-card mt-3 overflow-hidden">
              <div className="grid grid-cols-2 border-b border-line bg-surface px-5 py-3">
                <p className="t-label text-foreground">We say</p>
                <p className="t-label">Instead of</p>
              </div>
              <ul className="divide-y divide-line">
                {WORDS.map(([say, not]) => (
                  <li key={say} className="grid grid-cols-2 gap-4 px-5 py-3.5 text-[14.5px]">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sealed" />
                      {say}
                    </span>
                    <span className="text-mute line-through decoration-line-strong">{not}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-[13px] text-mute">
              Punctuation: no em dashes. Use a comma, a colon or a full stop.
            </p>
          </section>

          {/* interface */}
          <section>
            <SectionHead
              id="interface"
              title="Interface"
              lede="The product follows the same rules, so the app and the site feel like one object."
            />
            <div className="mt-12 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
              <div className="gl-panel flex items-center justify-center bg-surface p-6 sm:p-10">
                <SealedField tone="soft" />
                <div className="relative w-full max-w-[400px] rounded-[18px] border border-line bg-panel p-5 shadow-pop">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-mute">Private balance</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sealed-soft px-2.5 py-1 text-[12px] font-medium text-sealed">
                      <span className="h-1.5 w-1.5 rounded-full bg-sealed" /> Only you
                    </span>
                  </div>
                  <p className="tnum mt-3 text-[40px] font-light leading-none tracking-[-0.02em]">
                    12,480 <span className="text-[18px] text-mute">USDG</span>
                  </p>
                  <div className="mt-5 flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-[13px]">
                    <span className="text-mute">The public sees</span>
                    <SealDots n={7} className="text-foreground/60" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <span className="btn btn-ink btn-block">Send privately</span>
                    <span className="btn btn-ghost btn-block">Cash out</span>
                  </div>
                </div>
              </div>
              <ul className="gl-card divide-y divide-line">
                {[
                  ["One primary action", "A single ink pill per screen. Everything else is a ghost or a quiet link."],
                  ["Hidden amounts are dots", "A short row of dots, never black bars or blur. It reads as sealed, not broken."],
                  ["Sealed is a green dot and a word", "Private, sealed, verified, paid. Always paired with a label."],
                  ["Cards float on soft ground", "White cards on a soft grey ground by day, graphite on night by night."],
                  ["Light numbers, big", "Money is the largest thing on the page and the lightest weight."],
                ].map(([t, b]) => (
                  <li key={t} className="p-5">
                    <p className="text-[16px]">{t}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-mute">{b}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* downloads */}
          <section>
            <SectionHead
              id="downloads"
              title="Downloads"
              lede="Everything in one archive, or file by file. Need something that is not here? Ask on X."
            />
            <div className="mt-12 grid gap-3 lg:grid-cols-[1fr_2fr]">
              <div className="theme-dark gl-panel flex flex-col justify-between bg-black p-8 text-foreground">
                <Mark size={44} />
                <div className="mt-16">
                  <p className="text-[22px] font-light tracking-[-0.015em]">The Gloam brand kit</p>
                  <p className="mt-2 text-[14px] text-mute">Marks, wordmarks, avatars, the X banner and the courier etching.</p>
                  <a href={`${KIT}/gloam-brand-kit.zip`} download className="btn btn-ink mt-6">
                    Download .zip
                  </a>
                </div>
              </div>
              <ul className="gl-card divide-y divide-line">
                {DOWNLOADS.map((d) => (
                  <li key={d.file} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <span className="min-w-0 truncate text-[14.5px]">{d.label}</span>
                    <a
                      href={`${KIT}/${d.file}`}
                      download
                      className="inline-flex h-8 shrink-0 items-center rounded-full bg-surface px-3 text-[12.5px] text-soft transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      {d.kind}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
