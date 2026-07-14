# Gloam — Claude handoff

You are taking over **Gloam**: private trading on **Robinhood Chain**.

## Thesis (canonical)

**Trade Everything on Robinhood Privately.**

- Stocks + memes on the same rails
- Shielded balances, private transfers, private trade
- Real privacy — never mock fills or theatrical privacy
- Domain: `gloam.trade` · Docs: `docs.gloam.trade` · X: `@gloamtrade`
- Repo: `github.com/cryptoduke01/gloam` · monorepo `app/` + `docs/`

## Brand

| Token | Value |
| --- | --- |
| Black | `#000000` |
| Lime | `#C8FF00` (`#c8ff00`) |
| White | `#ffffff` |
| Display | Instrument Serif |
| Body | Overused Grotesk |
| Chain | Robinhood Chain · mainnet `4663` · testnet `46630` |

No purple crypto slop. Voice: dense, theoretical, premium — not startup fog, not em-dash AI slop.

## Stack

- pnpm monorepo, Node 20+
- Next.js 16 App Router + Tailwind v4
- Framer Motion (`app/src/components/motion.tsx`)
- Marketing: `app/` → Vercel Root Directory **`app`**, Output Directory **empty**
- Docs: `docs/` → separate Vercel project, Root **`docs`**, Output **empty**
- App build: `pnpm run build` uses `next build --webpack` (turbopack monorepo issues)
- OG images: system fonts only, stay under Edge 1MB limit

## Key files

```
app/src/components/Landing.tsx      # main landing
app/src/components/HeroPrivacyArt.tsx
app/src/components/EncryptFlow.tsx  # money-encryption diagram (code, not AI image)
app/src/components/AsciiImage.tsx   # plate/ink + lime multiply
app/src/components/Header.tsx Footer.tsx ThemeDock.tsx CookieBanner.tsx
app/src/app/globals.css layout.tsx opengraph-image.tsx
app/public/ascii/*                  # hero, shield, move, trade, rim, plates
docs/src/app/*                      # intro, chain, privacy-model, encryption, product, whitepaper
docs/src/components/DocShell.tsx
AGENTS.md DEPLOY.md
```

## Your job when you take over

Do a full QA pass and fix everything you find. Priorities:

1. **Empty / black voids** — spacing, dead padding, motion `opacity: 0` stuck states, viewport margins on `whileInView`
2. **Design polish** — alignment, contrast (light + dark), mobile nav, hero media, section rhythm
3. **Headless / a11y** — real buttons/links, focus rings, reduced motion, labels, hit targets ≥40px
4. **Copy consistency** — thesis everywhere; no stale “stock tokens only” language
5. **Docs UX** — readable shell, nav, whitepaper integrity
6. **Build health** — `pnpm build:app` and `pnpm build:docs` must pass
7. **Deploy traps** — never set Output Directory to `.next`; keep Vercel roots `app` / `docs`

### Inspect checklist

- [ ] Desktop + mobile (375 / 768 / 1280)
- [ ] Light theme + dark theme
- [ ] Scroll entire landing — no black empty bands
- [ ] Hero image: no tear/stitch gimmicks
- [ ] Encrypt section labels exact and readable
- [ ] Cookie consent + theme dock
- [ ] OG/twitter image still slim
- [ ] External links: docs, whitepaper, X
- [ ] `prefers-reduced-motion`

### Do not

- Invent fake privacy features or mock success UX
- Add purple gradients / generic crypto aesthetic
- Force-push or rewrite git history without asking
- Put secrets in client code
- Use AI image gen for labeled diagrams (build with code/SVG)

### Commands

```bash
pnpm install
pnpm dev:app    # :3000
pnpm dev:docs   # :3001
pnpm build:app
pnpm build:docs
```

Ship fixes on `main` after build passes. Prefer small, reversible commits.
