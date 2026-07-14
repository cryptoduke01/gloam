# Production gate (contracts + circuits)

Testnet Poseidon pool is live with **dev ceremony** keys. Mainnet is blocked until this checklist is complete.

## 1. Ceremony

- [ ] Public Powers of Tau (or documented reuse of a known secure ptau)
- [ ] Circuit-specific multi-party contribution for **unshield** and **transfer**
- [ ] Publish contribution transcripts / hashes
- [ ] Export production `*_final.zkey` + matching Solidity verifiers
- [ ] Update `app/src/lib/circuitArtifacts.ts` SHA-256 fingerprints
- [ ] Set `PROVING_CEREMONY = "production"` only after verifiers are redeployed

## 2. Deploy

- [ ] Deploy production UnshieldIVerifier + TransferIVerifier + DualProofVerifier
- [ ] Deploy ShieldPoolPoseidon (or hardened successor) with production verifier
- [ ] Transfer ownership / renounce as designed; document emergency path
- [ ] Record addresses in `deployments/mainnet.json` (or chain-specific)
- [ ] Point app env at production pool + deploy block

## 3. Review

- [ ] Independent review of pool, verifiers, circuits
- [ ] Fix critical/high findings
- [ ] Threat model sign-off (anonymity set, owner keys, note custody)

## 4. Ops

- [ ] Incident contact + disclosure process
- [ ] Monitoring (pool balance, root, verifier, pause if any)
- [ ] No always-true mock verifier on funded pool (ever)

## Explicit non-claims until done

- Not production-safe
- Not mainnet-ready
- Dev zkeys must not be used for real money
