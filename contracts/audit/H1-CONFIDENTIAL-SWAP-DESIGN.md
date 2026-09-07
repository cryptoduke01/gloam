# H1 — Confidential-solvency sealed swap: the design

This is the concrete design for re-enabling sealed swaps with **full size
privacy and exact solvency**, the only version consistent with Gloam's thesis
(size stays sealed, never a size-public swap). It supersedes option A/B in
`H1-SWAP-SOLVENCY.md` and specifies option C to an implementable level. It is a
mainnet-grade protocol build, so swaps remain disabled
(`sealedSwapVerifier == 0`) for the buildathon; this is the path to turning them
back on, and the technical story behind that decision.

## 1. The invariant that breaks

The pool is solvent for an asset when the tokens it physically holds cover every
note denominated in that asset:

```
inventory[asset]  >=  liability[asset]              (per asset, always)
```

`inventory[asset]` is public: it is the ERC-20 balance the pool contract holds.
Today `deposited[asset]` tracks it (ShieldPoolPoseidon.sol: `deposited[asset] +=
amount` on shield L318, `deposited[asset] -= amount` on unshield L242/L440).
`liability[asset]` is the sum of live note amounts in that asset, and note
amounts are private, so liability is not something the contract can read.

Each operation's effect on the invariant:

| op | inventory | liability | solvent? |
| --- | --- | --- | --- |
| shield(asset, amount) — amount public | +amount | +amount | yes (both move) |
| unshield(asset, amount) — amount public | −amount | −amount | yes (checked) |
| transfer (A→A) — amounts private | 0 | 0 (value stays in A) | yes |
| **sealedSwap (A→B) — amounts private** | **0** | **A: −in, B: +out** | **NO for B** |

A sealed swap conserves USD value (`amountOut·rateOut == amountIn·rateIn`, proven
in-circuit) but moves **no tokens**: the swapper's A still sits in the pool and no
B ever entered it. So `liability[B]` rises while `inventory[B]` does not. Over
many swaps the pool accumulates A and runs a B deficit, and an attacker unshields
a swap-minted B note against an honest depositor's B (the H1 PoC). `deposited[]`
is not updated because the deltas (`amountIn`, `amountOut`) are private circuit
inputs; the contract has no cleartext number to debit or credit.

You cannot have full size privacy and exact per-asset solvency in the plain
`note + deposited[]` model. You need (a) physical B to back the new B liability,
and (b) a way to account for the private deltas. This design supplies both.

## 2. Design: a confidential reserve the swap draws from

Add a protocol-owned **reserve** of each asset that swaps draw the counter-asset
from, and track the reserve's per-asset balance as a **Pedersen commitment** so
individual swap sizes stay hidden while the contract can still enforce solvency.

State (per asset):
- `inventory[asset]`: public ERC-20 balance (unchanged).
- `R[asset] = Commit(r, b) = r·G + b·H`: a Pedersen commitment to the reserve
  balance `r` of that asset, blinding `b`. Public commitment, hidden value.

A sealed swap A→B now proves, in the circuit, in addition to the existing
constraints (Merkle membership, nullifier, `amountOut·rateOut ==
amountIn·rateIn`, `amountOutMin`, range checks, and the missing `secret != 0`):

1. **Reserve sufficiency:** `0 <= amountOut <= r_B`, a range proof against the
   committed reserve `R[B]`. The pool physically has the B to mint.
2. **Homomorphic reserve update:** the new commitments
   `R'[A] = R[A] + Commit(amountIn, bA)` and
   `R'[B] = R[B] - Commit(amountOut, bB)` are well-formed for the same private
   `amountIn`/`amountOut` used in the note math. The contract applies these
   commitment updates with no cleartext amount.

The contract stores `R[A] = R'[A]`, `R[B] = R'[B]`, verifies the Groth16 proof
(now with the extra public inputs for the old/new commitments), then inserts the
note commitments exactly as today. Value conservation + reserve sufficiency mean
the swap can never mint more B than the reserve holds, so
`inventory[B] >= liability[B]` is preserved at every swap, with `amountIn` and
`amountOut` never revealed.

## 3. Keeping the reserve stocked (batched, net-only rebalance)

Swaps drain B from the reserve and pile A into it. A keeper periodically
**rebalances** on an external DEX: it settles a batch of swaps by revealing only
the **net** per-asset delta across the whole batch, not any individual swap, and
trades the net excess A for the net deficit B to refill the reserve. Individual
sizes stay sealed inside the batch; only the aggregate crosses the public
boundary, and the aggregate is not attributable to any one swapper. The
commitments are re-anchored to the post-rebalance reserve balances.

Solvency between rebalances is bounded by the reserve size: the circuit's reserve
range proof guarantees no swap outruns the physical reserve, and the keeper only
needs to keep the reserve non-empty, not to settle each swap synchronously.

## 4. What it costs

- **Circuit:** extend `sealedSwap.circom` with the Pedersen commitment ops, the
  reserve range proof, and `secret != 0`. New public inputs: `R[A]`, `R[B]`,
  `R'[A]`, `R'[B]`. Roughly doubles the constraint count.
- **Trusted setup:** a fresh production ceremony for the new circuit (folds into
  the mainnet ceremony already on the gate).
- **Verifier + contract:** new `SealedSwapVerifier`, reserve-commitment state,
  the homomorphic-update checks, and reserve admin (fund / withdraw / rebalance).
- **Keeper:** an off-chain batch settler with a DEX route and a public net-delta
  log. Trust-minimized: it can only rebalance toward the committed deltas, it
  cannot forge notes or move user funds.
- **Oracle:** the M3 Chainlink rate binding is already built; it prices the
  conservation constraint so the reserve is not drained by mispriced swaps.

## 5. Prerequisite, regardless of path

Before any re-enable, add `secret != 0` to `sealedSwap.circom` (circuit L1) and
regenerate the artifacts. A zero secret yields a predictable nullifier; it is a
cheap, unconditional fix and belongs in the same circuit revision as the reserve
work.

## 6. Recommendation

For the buildathon, **keep sealed swaps disabled** and present this as the
mainnet design. It is a stronger, more honest technical story than shipping
either an insolvent swap or a size-public one that contradicts the pitch: shield,
private send, cash out, and selective disclosure are live and solvent today, and
the sealed swap has a specified, sound path to full-privacy solvency via a
confidential reserve. Implement it against the production ceremony, behind an
external review of the reserve accounting and the keeper, never as a
pre-submission rush on solvency-critical code.
