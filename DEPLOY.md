# Deploy & subdomains

## Domains we own

- **Primary:** `gloam.trade`
- **App:** `app.gloam.trade`
- **Docs:** `docs.gloam.trade`

## Vercel (recommended)

1. Import this GitHub repo twice (or once with monorepo filters):
   - Project **gloam-app** → Root Directory `app` → domain `app.gloam.trade` (+ optional `gloam.trade`)
   - Project **gloam-docs** → Root Directory `docs` → domain `docs.gloam.trade`
2. DNS at registrar:
   - `CNAME app` → `cname.vercel-dns.com`
   - `CNAME docs` → `cname.vercel-dns.com`
   - Apex `gloam.trade`: A/CNAME per Vercel docs (or redirect apex → `app.gloam.trade`)

## Local ports

| Package | Port |
| --- | --- |
| app | 3000 |
| docs | 3001 |
