# Gloam

**Thesis: Stablecoins are becoming how businesses and AI agents pay each other, and every one of those payments is public. Gloam makes them private, and lets the payer prove exactly what someone needs to see.**

Tagline: private by default, provable on demand. Hero line: private money on public chains.

- Lead with stablecoin payments, payroll and agent payments, on Tempo and Robinhood Chain mainnets (beta), with the testnets next to them.
- Why the tech fits: a payment has one owner, so the owner proves it on their own device with zero-knowledge proofs and nobody else holds a key. Committee systems (Zama FHE, Arcium MPC) and operator systems (Tempo Zones) suit shared secrets, not single-owner payments.
- Not new cryptography: the Zcash-lineage pool. New, as far as our research found: the payroll total proof, proofs scoped to one reader with an expiry (`context` input), and private payments for agents (MPP method proposal, x402, MCP with spending limits).
- Stock tokens: Robinhood Chain testnet only, held and sent privately there. Private swaps are live on Robinhood Chain and Tempo mainnet: a swap goes from the private balance through a one-time escrow to a public DEX and back. Who swapped stays private; the pair and the amounts are public. The old sealed trade stays retired.
- Never claim "first" or "only". Mainnet is live in beta: say it has beta deposit limits, was reviewed internally (20 October 2026) and that an external audit is planned. Never say "audited". Never say a swap hides its amounts, or call it anonymous or untraceable. $GLOAM: facts only (a mainnet pool asset on Robinhood Chain; half of Gloam's fees buy it back). Say "no admin withdraw, timelocked rule changes", not "no admin" or "trustless".
- Comparison and honest gaps: `/docs/compare`, `/docs/privacy-model`, `/docs/production`. Every address on every network, read live and as a CSV: `/verify#contracts` (from `app/src/lib/contractDirectory.ts`).

## Canonical

- Domain: `gloam.trade` (single host)
- Docs: `gloam.trade/docs`
- Whitepaper: `gloam.trade/whitepaper`
- Pitch deck: `gloam.trade/pitch` (source `app/public/pitch/index.html`; `pitch/gloam-deck.html` is a repo copy, keep them in sync)
- Product: `gloam.trade/app`, mainnet and testnet in one app, switched in-app (future testnet host: `testnet.gloam.trade`)
- X: `@gloamtrade`
- Vercel: one project, Root Directory = `app`
- Contracts: `contracts/` (Foundry). Mainnet: `ShieldPoolPayments` (payments only) on Robinhood Chain mainnet (`4663`) and Tempo mainnet (`4217`). Testnet: `ShieldPoolPoseidon` on Robinhood Chain testnet (`46630`) and Tempo Moderato testnet (`42431`)
- Mainnet vaults (no admin withdraw, 3-day timelock on rule changes): Robinhood Chain `0x39e28cde55cab798874746ac52cb4b5cc99a0194` (deploy block `94194599`), Tempo `0x39e28cde55cab798874746ac52cb4b5cc99a0194` (deploy block `45172561`). PoseidonT3 on both: `0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4`. Owner `0x76b7E410a227c888aBD2Bdc24Ee32E094B0FD4D8` (one wallet at launch, multisig planned); treasury `0xB3900ac9350903218e4c7597bAb0f008F01B30B8` (cash-out fees since 24 October 2026); relayer `0xb1E994586E62994648a0b866BF33F2EDd942512e` (Gloam team runs it; it cannot move or redirect money)
- Base: Base Sepolia (`84532`) is live as a testnet since 24 Oct 2026 (vault `0x39e28cde55cab798874746ac52cb4b5cc99a0194`, deploy block `49802958`; memo board `0x01B3172d9900Cb26d57E986429b9b23854c74598`; `contracts/deployments/base-sepolia.json`). Base mainnet (`8453`) is next, not deployed, hidden until `MAINNET_POOLS[8453]` is filled in (`app/src/lib/mainnet.ts`, `packages/sdk/src/mainnet.ts`). Both are `ShieldPoolPayments` on the final keys with beta limits (USDC, EURC, ETH; USDT on mainnet). Runbook `DEPLOY-BASE.md`. Base Sepolia is a testnet that sets `ceremony: "production"` and `paymentsPool: true`.
- Ethereum (next, not deployed): Ethereum mainnet (`1`), `ShieldPoolPayments` on the final keys with beta limits (USDC, USDT, USDG, PYUSD, EURC, ETH); its testnet is Ethereum Sepolia, below. Runbook `DEPLOY-ETHEREUM.md`. Hidden everywhere until `MAINNET_POOLS[1]` is filled in. The relay has a gas ceiling there (`lib/relay/gasCeiling`, 3 gwei by default): over it nothing is sent (`gas_high`) and scheduled cash outs wait. USDT on Ethereum needs a stale allowance set to 0 before a new approval.
- Ethereum Sepolia (`11155111`, key `ethereum`): a testnet like Base Sepolia (`ShieldPoolPayments`, final keys, beta limits; USDC, USDG, PYUSD, EURC, ETH). Not deployed yet, hidden until `ETHEREUM_SEPOLIA_POOL` is filled in (`app/src/lib/mainnet.ts`, `packages/sdk/src/mainnet.ts`; `contracts/ethereum-sepolia-after-deploy.sh` writes both). Runbook `DEPLOY-ETHEREUM-SEPOLIA.md`. Reads go through Tenderly's gateway first: publicnode keeps only about 10,000 blocks of Sepolia history.
- Testnet vaults: Robinhood Chain `0x72406D9597807A46f730d8b4fDBC5aC45Dc1d740`. Tempo `0x841dc046ea3cc842ba3a855731472c6eb0f2d5eb`. Drainable, never use or seed: `0x4F38…12D8F` (audit H-P1). Never product-default `0xA488…`

## Live

Mainnet (final keys, beta deposit limits: 500 per deposit and 25,000 total per stablecoin, $GLOAM 25,000 per deposit and 250,000 total) and the testnets (dev keys, test funds):

- Shield, private send, cash out, private payroll (one-off and scheduled), payment requests, the Gloam relay
- Mainnet assets: USDG and $GLOAM on Robinhood Chain; USDC.e, pathUSD, USDT0 and OUSD on Tempo. Deposits and private payments are free; a cash out costs 0.25%
- Proofs of funds, payment and payroll totals, checked at `/verify`
- Agent payments over x402 and MPP, MCP server with spending limits
- Stock tokens held and sent privately on the Robinhood Chain testnet (testnet only)
- Private swaps from the private balance on both mainnets (routers 0x34AB06208586A737Bf1607fa996Bc9162271c52d on Robinhood Chain, 0xfCa1887e77f738ef9C5751974b3f3873d029F2DC on Tempo); the old sealed trade stays retired
- App root: `app/` · never revive `docs.gloam.trade`

## Audits

- Reviews so far are internal: two rounds with fixes deployed, then the pre-mainnet review of 20 October 2026, closed with no Critical or High findings open. The multi-party ceremony is done (13 contributors, drand round 6561386, release `ceremony-final`). An external audit is planned, not done.

## Rules

- Real privacy (shielded balances, private txs). Never fake or mock success.
- **Public path** needs no Gloam contracts. **Private path** needs `contracts/`.
- Mainnet is the product (beta); the testnets sit next to it. Call networks mainnet and testnet, with no glosses (no "real money", "play money", "test money", "no real value" or "free practice"), and never let a mainnet path use dev keys.
- Two key sets: testnet verifiers hold the dev keys (`contracts/src/verifiers/*`, `app/public/circuits/*`), mainnet the ceremony's final keys (`contracts/src/verifiers/final/*`, `app/public/circuits/final/*`). Each network names its set (`GloamNetwork.ceremony`); a mainnet entry sets `"production"`. `script/KeyCheckProofs.sol` (regenerate with `node contracts/circuits/scripts/gen-key-fixtures.mjs`) proves which keys a verifier holds.
- Brand: monochrome with a green tint (`#2e7d53` light, `#8fd3ad` dark), Aeonik, light and dark. Calm, spacious, plain-language.
- Secrets server-side only.
- If it does not serve private payments for people, teams and agents on Tempo and Robinhood Chain, it waits.
- Docs live in-app (`app/src/app/docs`). Do **not** create a separate docs project or `docs.gloam.trade`.
- Commit = commit + push to `main` for product work.
