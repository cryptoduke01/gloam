# Deploy (Vercel)

One project. One domain. Docs live on the same app.

## Marketing + docs (`gloam.trade`)

| Field | Value |
| --- | --- |
| Root Directory | **`app`** |
| Framework | **Next.js** (auto) |
| Build Command | `pnpm run build` (or leave default) |
| Output Directory | **Leave empty** (do not set `.next`) |
| Install Command | `pnpm install` |
| Node | 20+ |

If Root Directory is the repo root instead of `app`, Vercel looks for `.next` at `/vercel/path0/.next` and fails with `ENOENT ... package.json`.

## Routes

| Path | Content |
| --- | --- |
| `/` | Landing |
| `/docs` | Docs overview (Arrow-style) |
| `/docs/*` | encryption, privacy-model, chain, product |
| `/whitepaper` | Whitepaper |
| `/terms` `/privacy` `/cookies` `/disclosures` | Legal |

## Domains

- `gloam.trade` / `www` → this project only
- **No** `docs.gloam.trade` (removed — use `/docs`)
- `app.gloam.trade` / `testnet.gloam.trade` → later product

## Note on `docs/` package

The standalone `docs/` package is legacy. Do not deploy it. Canonical docs are in `app/src/app/docs` and `app/src/app/whitepaper`.
