# H1 — Sealed-swap solvency: the design decision

Swaps are disabled (`sealedSwapVerifier == 0`) because `sealedSwap()` mints an
`assetOut` note without any per-asset accounting. This is the analysis for how to
re-enable them safely. It is a genuine protocol decision, not a patch, which is
why it is left for a human call rather than chosen autonomously.

## The root problem

A shielded swap spends an `assetIn` note (`amountSwap`, private) and mints an
`assetOut` note (`amountOut`, private). Value is conserved in USD at the oracle
rate, but **the pool's physical balances do not move**: the swapper's `assetIn`
is still sitting in the pool, and no `assetOut` entered it. So after the swap the
pool holds *excess `assetIn`* and owes *a deficit of `assetOut`*. Over many swaps
it accumulates `assetIn` and runs out of `assetOut`, and an attacker can unshield
a swap-minted `assetOut` note against an honest holder's deposit (the H1 PoC).

The reason `deposited[]` is not updated is fundamental: the amounts are **private
circuit inputs**, so the contract has no correct per-asset number to credit or
debit. You cannot have full size-privacy *and* exact per-asset solvency in the
current note + `deposited[]` model without adding one of the mechanisms below.

## Options

### A. Public swap amounts (simple, exact, costs size privacy)
Make `amountSwap` and `amountOut` public circuit inputs. The contract does
`deposited[assetIn] -= amountSwap; deposited[assetOut] += amountOut` with a
solvency check, and a keeper periodically rebalances the pool's excess `assetIn`
into `assetOut` on a DEX to back the new `assetOut` claims.
- **Solvency:** exact.
- **Privacy:** the swap *size* becomes public. The swapper's identity and their
  other notes stay hidden, so it is an *unlinkable* swap, not a *sealed* one.
- **Cost:** `sealedSwap.circom` 9 -> 11 public inputs, verifier + zkey/wasm regen,
  app update, a rebalancing keeper. Contradicts the current "size stays sealed"
  pitch, so it is a positioning change.

### B. Owner-funded reserve + rebalance (privacy kept, needs amounts anyway)
Hold an owner-funded `assetOut` reserve and draw from it per swap. But the draw
size is `amountOut`, which is private, so the reserve accounting still needs the
amount. This collapses into option A unless amounts are revealed. Not a clean win.

### C. Confidential accounting (the real fix, real R&D)
Track `deposited[]` as homomorphic (Pedersen) commitments, update them with the
swap's committed amounts without revealing them, and prove solvency in zero
knowledge. Keeps full size privacy and solvency. This is a substantial protocol
build (confidential balances + a solvency circuit), a post-buildathon roadmap
item, and a genuine differentiator to talk about.

## Recommendation

For the buildathon, **keep swaps disabled and lead with what is genuinely private
and solvent** — shield, private send, cash out — plus the audit narrative, the M3
oracle-bound rates (built, ready to wire feeds), and selective disclosure. Frame
sealed trade honestly as the roadmap, with option C as the destination. This is
more defensible to technical judges than shipping either an insolvent swap or a
size-public swap that contradicts the pitch.

If you want a working swap in the demo instead, **option A** is the shippable one:
re-enable it explicitly as an *unlinkable* (not size-sealed) swap, with the oracle
rates and exact solvency. That is an honest, safe product; it just trades away the
size-privacy claim for swaps.

Either way, before any re-enable also add `secret != 0` to `sealedSwap.circom`
(circuit L1) and regen. Pick A or "stay disabled + roadmap" and I'll implement it.
