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

- `gloam.trade` / `www` → this project (landing + `/docs` + `/app`)
- **No** `docs.gloam.trade` (use `/docs`)
- Product today: `gloam.trade/app`
- Later: point `testnet.gloam.trade` at the same project (rewrite `/` → `/app` or keep path). No second codebase required.

## Note on `docs/` package

The standalone `docs/` package is legacy. Do not deploy it. Canonical docs are in `app/src/app/docs` and `app/src/app/whitepaper`.

## Testnet vault env (optional)

Defaults are hard-coded for the **sealed** Poseidon vault. You do not need env vars for private trade to work.

| Variable | Correct value | Do not set |
| --- | --- | --- |
| `NEXT_PUBLIC_POSEIDON_SHIELD_POOL` | `0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F` | `0xA488…` (pre-sealed; app remaps but clean env is better) |
| `NEXT_PUBLIC_SHIELD_DEPLOY_BLOCK` | `90436718` | `90260331` (old pool history) |
| `NEXT_PUBLIC_HASH_SCHEME` | `poseidon` | `keccak` unless debugging Phase-1 |

Admin: `ADMIN_ACCESS_CODE` (server-only).
