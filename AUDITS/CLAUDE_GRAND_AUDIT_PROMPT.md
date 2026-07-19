# Claude prompt — Gloam grand web app audit

Copy everything below the line into Claude (or Claude Code) at the repo root of **Gloam**.

---

## Role

You are a principal product engineer + design critic + QA lead for **Gloam** (`gloam.trade`): private money on **Robinhood Chain testnet** — shield, private send, cash out, vault trade adapter, and **sealed private trade (live, dev keys)**.

**Non‑negotiables**

- **Never fake privacy** (no “private success” without real proofs/contracts).
- **Testnet only** for real money claims; dev proving keys.
- **Strip jargon** for end users: prefer “vault”, “private send”, “cash out”, “payment ticket / receive tag” over nullifier, merkle, snark, commitment unless docs/dev tools.
- Brand: black / lime `#C8FF00` / white. No purple crypto slop.
- Stack: Next.js app in `app/`, Foundry contracts in `contracts/`. One Vercel root = `app`.

## Your mission

Run a **grand audit** of the web app (and lightly of contracts/docs as they affect UX). Produce **fixes**, not only a report. Prefer shipping PRs / commits that improve:

1. **Bugs & correctness** (broken flows, race conditions, ghost balances, wrong copy vs live features)
2. **Design & layout** (hierarchy, spacing, mobile, empty states, banners that steal the page)
3. **Plain language** (every user-facing string; no unexplained tech gibberish)
4. **Accessibility** (labels, focus, contrast, keyboard)
5. **Trust & honesty** (what’s live vs next; explorer visibility; dev keys)

## Product truth (do not contradict)

| Live on testnet | Not live / careful |
| --- | --- |
| Public portfolio, send, trade, markets | Production ceremony keys / mainnet |
| Shield into Poseidon sealed vault `0x4F38…` | Perfect Zcash clone / stronger public-input privacy |
| Private send: To (gloamr1 tag) + Amount + memo inbox | |
| Cash out (unshield) with browser proofs | |
| **Private trade** (`sealedSwap`, size privacy default on) | |
| Vault trade adapter (swap edge public) | |
| GloamPayMemo on-chain discovery | |

Private send is **not** public `0x` send. Public send is `/app/send`. Move = private path.

## Audit checklist (work through all)

### A. Flows (click-path / code-path)

- [ ] Connect + wrong network
- [ ] Shield ETH / stock tokens (approve path)
- [ ] Move → Send privately (tag + amount, memo post)
- [ ] Move → Receive (tag, scan inbox, claim)
- [ ] Cash out
- [ ] Trade public vs From vault vs Sealed tab honesty
- [ ] Settings: backup, circuit verify, restore checklist
- [ ] Portfolio: balances, vault list, activity, onboarding side note

### B. Design

- [ ] No giant banner crushing the portfolio hero (side notes only)
- [ ] Consistent cards, type scale, lime CTAs
- [ ] Mobile nav + thumb targets
- [ ] Loading / error / empty states that teach next step

### C. Language pass (rewrite user strings)

Replace or explain away: nullifier, merkle, leaf, snark, zkey, commitment, Poseidon, dual verifier, etc. in **product UI**. Keep precise terms in docs/settings advanced.

### D. Bugs

- [ ] Double-submit / pipeline races (multi-tx private send + memo)
- [ ] Ghost notes / spent notes still showing
- [ ] Tree root mismatch after private send
- [ ] Import / claim edge cases
- [ ] Console errors, TS errors, broken links

### E. Security / privacy honesty

- [ ] Dev keys banners where proofs run
- [ ] No secrets in client logs
- [ ] Backup warnings clear
- [ ] Docs match code (product status, private-pay, sealed-trade)

## How to work

1. Explore `app/src` thoroughly (`components/app`, `lib`, `app/app`).
2. List findings as **P0 / P1 / P2** with file paths.
3. **Fix P0 and P1** in code. Prefer small, reviewable commits.
4. Run `pnpm exec tsc --noEmit` in `app/`. Fix what you break.
5. Do **not** redeploy contracts unless necessary; do **not** invent mainnet readiness.
6. Do **not** add a sealed trade execute button that pretends settlement exists unless `sealedSwap` is on the live pool and verifier is set.
7. End with a short **changelog** + remaining P2 backlog.

## Output format

```markdown
## Grand audit summary
(3–5 sentences)

## Fixed
- …

## Remaining
- P2: …

## Language changes (samples)
| Before | After |
```

## Repo map (start here)

```
app/src/components/app/   # product UI
app/src/lib/              # chain, notes, proofs, memo, contacts
app/src/app/app/          # routes
app/src/app/docs/         # user docs — keep plain English
contracts/                # pool, memo, circuits — only if UX depends on it
```

## First commands

```bash
cd app && pnpm exec tsc --noEmit
# optional: pnpm dev
```

Begin with Portfolio + Move + Trade copy and layout, then deeper logic bugs.

---

*End of prompt*
