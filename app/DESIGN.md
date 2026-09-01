# Gloam design system

The Twilight brand, plus the principles pulled from studying the leading privacy
protocols (Arcium, Zama, Umbra). Use this to keep every surface consistent. The
short version: **use space, be confident, speak plainly, never jam things into
boxes, and never stamp "private" on everything.**

## Tokens (light-only)

| Role | Value | Tailwind token |
| --- | --- | --- |
| Paper (bg) | `#F4F3EF` | `bg-background` |
| Ink (text) | `#121316` | `text-foreground` |
| Indigo (accent) | `#3B3766` | `text-lime` / `bg-lime` (the `--lime` slot) |
| Mute | `#6E6E76` | `text-mute` |
| Line | `#E5E3DD` | `border-line` |
| Panel | `#FFFFFF` | `bg-panel` |
| Signal green | `#2E7D53` | `--chart-up` |
| Rust (error/down) | `#C0432F` | `--chart-down` |
| Twilight gradient | gold `#EEC996` → rose `#E4A69E` → violet `#9674B2` → indigo `#4A498C` | `.twilight-atmos` |

Typeface: **Aeonik** (self-hosted woff2), one family across the whole system.
Never reintroduce acid lime `#C8FF00`, Instrument Serif, or a second family.

## What the references teach us

- **Arcium** (light bg, a bold indigo-violet gradient, minimal nav, generous
  whitespace, rounded pills). Validates Twilight almost exactly. Takeaway: use
  the twilight gradient with confidence as a hero/section device, and give
  sections room.
- **Zama** (bold black + bright accent, huge type, enormous whitespace, and the
  positioning: "Confidential Onchain Finance", "the HTTPS moment", institutional
  / compliance framing). Takeaway: bigger, more confident headlines; more air;
  and lean the copy toward "private but provable / compliance-friendly", which is
  the answer to the dark-pool objection (this is what selective disclosure buys).
- **Umbra** (simple, clean, non-technical). Takeaway: keep the app approachable,
  plain-language, no jargon. A user should never see "dev proving keys" or a
  witness dump.

## Principles (apply everywhere)

1. **Space over density.** Generous padding and gaps. If it feels jammed, it is.
   App content sits in `max-w-7xl` with `sm:px-8` and `sm:py-14`; docs use real
   `gap-x-16` between columns. Cards are `rounded-2xl` with `p-5`/`p-6`.
2. **Confident type.** Big display headlines (`text-4xl`/`5xl`+), tight tracking,
   Aeonik. Let headlines breathe with `text-wrap: balance` where possible.
3. **No stacked panes on a boxed form.** The Vault uses a quiet vertical action
   rail (sticky on desktop, horizontal scroller on mobile) beside a roomy form
   column, not four tabs over a centered box. Reuse `.vault-rail`.
4. **Plain language, no chrome.** No "dev proving keys / testnet only / production
   gate" stamped on forms or footers. Caveats live in the docs. Copy names things
   by what a person does (Shield, Send, Cash out, Trade), not the mechanism.
5. **Do not over-mark "private".** One clear signal is enough. No per-row PRIVATE
   pills, no "· private" suffixes on every market. It reads as childish.
6. **Dev-safe responsive swaps.** Webpack dev loses `sm:`/`lg:` display variants
   to a conflicting base class. For row↔column swaps use a real CSS media query
   (`.app-nav`, `.mkt-controls`, `.vault-rail`), not `flex-col sm:flex-row`.
7. **Theme-honest colors.** Everything from the token set. No `text-red-300` /
   dark-mode leftovers on the light theme (use Rust `#C0432F`).

## Applied so far

Vault (action rail + roomy form), Markets (aligned filters, no private pills),
Docs (wide, real column gaps, borderless nav), 404 (branded, spacious), Admin
(light-theme error colors, wider, rounded), and the app shell padding. The
landing already uses the twilight system; when polishing it, push space and type
per the principles above rather than restructuring it.
