# Security notes (Gloam testnet)

## Secrets policy

| Do | Don't |
| --- | --- |
| Put `DEPLOYER_PK` only in shell env / CI secrets | Commit private keys, mnemonics, or `.env` |
| Use public contract addresses in app defaults | Put funded mainnet keys anywhere in the repo |
| Keep circuit zkeys labeled **dev ceremony** | Claim production security with current zkeys |

## Secret scanners / git guard false positives

These are **not** private keys:

- `app/public/circuits/*.zkey` / `*.wasm` — public proving artifacts (dev ceremony)
- `contracts/deployments/*.json` — public addresses + explorer URLs
- `contracts/test/fixtures/*` — Poseidon bytecode for unit tests
- Long `0x…` hex that is a **transaction hash** or **contract address**

Allowlist: [`.gitleaks.toml`](./.gitleaks.toml)

If a scanner still flags a **public** tx hash or zkey, mark as false positive. If it flags a 64-byte hex that is a real private key, **rotate immediately** and purge history.

## Vault notes

- Notes (secrets) live in browser `localStorage`.
- Settings → backup: plain JSON or passphrase-locked (`gloambak1.…`).
- Anyone with an unlocked backup can spend those notes.

## Report

Operational security issues for the product: open a private channel with the maintainers / `@gloamtrade`. Testnet funds only until production ceremony + audit.
