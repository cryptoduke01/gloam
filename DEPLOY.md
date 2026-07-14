# Deploy (Vercel)

## Marketing site (`gloam.trade`)

**Project settings (this is what fixes the `.next/package.json` error):**

| Field | Value |
| --- | --- |
| Root Directory | **`app`** |
| Framework | **Next.js** (auto) |
| Build Command | `pnpm run build` (or leave default) |
| Output Directory | **Leave empty** (do not set `.next`) |
| Install Command | `pnpm install` |
| Node | 20+ |

If Root Directory is the repo root instead of `app`, Vercel looks for `.next` at `/vercel/path0/.next` and fails with `ENOENT ... package.json`.

## Docs (`docs.gloam.trade`)

Second project:

| Field | Value |
| --- | --- |
| Root Directory | **`docs`** |
| Framework | Next.js |
| Output Directory | empty |

## Domains

- `gloam.trade` / `www` → marketing project
- `docs.gloam.trade` → docs project
- `app.gloam.trade` / `testnet.gloam.trade` → later
