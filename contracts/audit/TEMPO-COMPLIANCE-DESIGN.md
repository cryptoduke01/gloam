# Tempo compliance reconciliation: freeze and blocklist against a shielded pool

The open technical risk from `TEMPO_EXPANSION.md` section 7. On Tempo every token
natively enforces issuer allowlist / blocklist / freeze, verified by Mainnet. A
shielded pool hides the beneficial holder, which appears to remove the issuer's
ability to freeze or blocklist. This is the design that reconciles the two, so
Gloam can shield a compliance-enforcing stablecoin without breaking the issuer's
controls, and without becoming an operator-visible Zone.

## The key observation: value only enters and leaves at public edges

A Gloam pool has exactly two points where tokens actually move on-chain, and both
are public:

- **shield (deposit):** an ordinary token transfer from a known address into the
  pool. The depositor and the amount are visible.
- **unshield (cash out):** an ordinary token transfer from the pool to a known
  recipient. The recipient and the amount are visible.

Everything in between (private send, selective disclosure) moves no tokens; it
only rewrites commitments. So the issuer's controls do not need to see inside the
pool. They need to hold at the two edges where the token itself moves. Enforce
compliance at the boundary, keep privacy in the middle.

## Boundary enforcement

Add issuer-control checks to the two public entry points, reading the token's own
compliance state (the same allowlist / blocklist / freeze the issuer already
maintains on Tempo):

1. **shield(asset, amount, ...):** require the depositor is allowlisted and not
   blocked or frozen for `asset`. A blocked or frozen holder cannot move value
   into the shielded set in the first place.
2. **unshield(asset, to, amount, ...):** require `to` is allowlisted and not
   blocked or frozen for `asset`. Frozen or blocked value cannot leave the pool
   to a usable public balance.

Consequence for a holder frozen *after* they shielded: they can still rewrite
their own commitments privately inside the pool, but they cannot unshield to any
address the issuer will honor, so the value is trapped in the pool and unusable
externally. That satisfies the intent of a freeze (the holder cannot spend the
asset in the real economy) without the pool having to deanonymize in-pool
activity. The issuer freezes at the edges; the pool stays private in the middle.

This is enforceable on-chain because shield and unshield already carry the real
address and asset in the clear. No circuit change is required for the basic
control: it is a check in the pool contract against the token's compliance view.

## Where the issuer viewing key fits

Boundary enforcement covers control (who may move value in and out). Oversight
(auditing specific flows) is served separately and privately by the issuer
viewing key already scaffolded in the SDK (`buildComplianceDisclosure`, an
issuer-scoped disclosure over a payment note). The issuer verifies a disclosure
for a payment it is entitled to see, learning that one note is worth (amount,
asset), and nothing else. Encrypting the disclosure to the issuer's published
viewing key is the remaining deployment step. This gives the issuer selective,
per-payment visibility without the blanket, always-on view a Zone operator has.

## What this deliberately does not do

- It does not let the issuer see or freeze individual in-pool balances. That is
  the privacy the product exists to provide, and boundary enforcement makes it
  unnecessary for the issuer to have it.
- It does not claim to trap value the moment a freeze lands. A holder frozen
  after shielding keeps private in-pool mobility; the guarantee is that they
  cannot exit to a spendable public balance the issuer honors.
- It does not apply to non-compliance-enforcing assets, which need none of this.
  Launch first on such an asset; add boundary enforcement when supporting a
  compliance-enforcing stablecoin.

## Build order

1. First launch: a non-freezing testnet asset. No boundary checks needed; proves
   the rails.
2. Compliance-enforcing stablecoin: add the shield / unshield boundary checks
   against the token's compliance view, and the issuer-viewing-key encryption for
   the disclosure path.
3. Only then, a compliance-enforcing asset on a public mainnet, behind the
   production ceremony and an external review of the boundary checks.

This keeps the same rule as the rest of Gloam: private by default, provable and
controllable exactly where a regulated asset requires it, never an operator who
sees everything.
