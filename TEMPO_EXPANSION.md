# Tempo expansion: design and positioning

Status: design. No Tempo contracts deployed yet. This is the plan that guides
Phase 1. Colosseum permits building up to two months before the Sep 14 start, so
this can be built now; judging weighs progress shown during the window.

Gloam runs one product on two chains: the flagship on Robinhood Chain
(tokenized-equity privacy) and an expansion on Tempo (private stablecoin
payments for people and agents). Same shielded-pool protocol, two chain-specific
frames. The runtime network toggle (Phase 0) is already shipped: see
`app/src/lib/networks.ts`, `app/src/components/app/NetworkProvider.tsx`,
`NetworkSelector.tsx`.

Tempo testnet (Moderato): chainId 42431, RPC https://rpc.moderato.tempo.xyz,
explorer https://explore.testnet.tempo.xyz, native currency USD, EVM (Reth).
Mainnet: chainId 4217, RPC https://rpc.tempo.xyz. Verified against
docs.tempo.xyz on 2026-09-07.

## 1. Why Tempo, and why now

Tempo (Stripe + Paradigm, payments-first EVM L1) states the problem in its own
words: every stablecoin payment leaks the amount, the sender, and the recipient.
That is Gloam's thesis, validated by the chain itself. Stablecoin payments is
also the single most winner-correlated solution tag in the Colosseum corpus
(see the Copilot landscape memo), and Tempo is the chain built for exactly that
asset. Private stablecoin payments on Tempo is the highest-EV frame available.

## 2. Tempo Zones: the lane marker, not the threat

Tempo announced Zones: operator-run private execution environments (parallel
chains anchored to Mainnet). Zones and Gloam are different privacy models for
different users, and Tempo's own writeup draws the line for us.

| Axis | Tempo Zones | Gloam |
| --- | --- | --- |
| Who sees payments | The zone operator sees all (by design, for compliance) | No one; only the user holds the note secret |
| Trust model | Permissioned, operator-run | Permissionless, self-custodial |
| Privacy tech | Private ledger + validity proofs to Mainnet | ZK proofs + anonymity set |
| Target user | Enterprises: payroll, treasury, settlement | Individuals and agents |
| Anonymity set | None (operator knows all) | Yes, the product |
| Agents | Not addressed | Native (MCP server, x402) |

Tempo's blog explicitly frames the ZK / shielded-pool approach as too complex
and not enterprise-compliant, and positions Zones as the enterprise answer. That
is a lane marker: Gloam is the permissionless, self-custodial, agent-native
privacy Zones deliberately is not. We do not compete with Zones for enterprise
payroll. We serve the users Zones cannot: individuals who want self-custodial
privacy with no operator, and agents that transact without leaking a spend
history. Positioning must never claim Tempo "lacks privacy"; it has Zones. Gloam
is a different kind of privacy on the same chain.

## 3. The crux: compliance controls travel with the token

On Tempo, every token natively enforces issuer allowlist / blocklist / freeze,
across all zones, verified cryptographically by Mainnet. A permissionless
shielded pool hides the beneficial holder, which removes the issuer's ability to
freeze or blocklist that holder. So a naive Gloam pool over a compliance-
enforcing Tempo stablecoin is in direct tension with the issuer's requirements.
This is a real design constraint and it gates asset choice.

Resolution, which is also the differentiator (the "compliant privacy" frame that
won for Encifher and Mercantill):

- **Selective disclosure (live today).** A user can prove one balance or one
  payment to one party. Extend the disclosure target set to include an issuer or
  auditor scope.
- **Issuer viewing key (new, Tempo-specific).** An optional issuer-scoped view
  capability so a regulated stablecoin issuer can satisfy oversight without the
  public seeing anything. This is the bridge between Zones (operator sees all)
  and pure anonymity (no compliance at all): private from the public, self-
  custodial, still issuer-compliant.
- **Freeze compatibility.** A design path where an issuer freeze on Mainnet can
  be honored against shielded notes (e.g., a freeze list checked in-circuit or
  at unshield). Open design item; see section 7.

Asset strategy given the constraint:

1. Launch on a Tempo asset that does not require issuer holder-level control
   (native USD gas asset behavior, a testnet faucet token, or a non-freezing
   stablecoin) to prove the rails end to end.
2. Add the issuer-viewing-key path so compliance-enforcing stablecoins become
   supportable, and lead the pitch with that (private and compliant).
3. Never silently shield a compliance-enforcing token in a way that breaks its
   issuer controls and hide that from the user. Honesty rule applies.

## 4. What deploys on Tempo (Phase 1)

- **Contracts.** Redeploy the shielded pool + DualProofVerifier (unshield +
  transfer) and shieldVerifier on Tempo (Solidity + Groth16 port directly; Reth
  is EVM). Keep sealed swaps disabled (H1), same as Robinhood. Live surface:
  shield, private send, cash out, selective disclosure.
- **Asset registration.** Register the chosen stable asset(s) per section 3.
  Amount handling must respect the native-USD decimals (confirm on chain; docs
  do not state, 18 assumed in `networks.ts` and flagged there).
- **Deploy block.** Record it for `syncTree` / `getLogs` tree rebuild; wire into
  the `tempo` entry in `networks.ts` and flip status from `planned` to `live`.
- **Consumer migration.** The runtime accessor is already in place:
  `getActiveNetwork()` in `app/src/lib/networks.ts` (non-React, reads the
  selector's localStorage key, resolves to Robinhood until Tempo is live) plus
  the `useNetwork()` hook for components. The remaining app surface is ~15 files
  (the components in `app/src/components/app` using `PRODUCT_CHAIN_ID` /
  `EXPLORER_TX`, and the pool/deploy-block resolvers in `config.ts` / `shield.ts`
  / `payMemo.ts`), not the 72 the raw grep suggested (the rest are static docs).
  Notes are already keyed by chainId, so per-chain vaults fall out for free.

  Do this as one coordinated cutover on deploy day, not before: it is
  behavior-preserving today (the active network is always Robinhood), so it adds
  no interim value and only risks the live write path. Recipe: components read
  `useNetwork().network` for `chainId` / `explorerTx` / `chain`; lib resolvers
  read `getActiveNetwork()`. Gotcha found in a trial: wagmi hook options
  (`useBalance`, `useSendTransaction`, `useWaitForTransactionReceipt`,
  `switchChain`) type `chainId` as the configured-chain literal, so add Tempo to
  the wagmi config (`wagmi.ts`) first and type `GloamNetwork.chainId` as the
  configured-id union (`46630 | 42431`), or the wagmi call sites will not
  typecheck. The module-level `SHIELD_POOL_ADDRESS` const also becomes a function
  call at use time so a runtime switch takes effect.

## 5. Agent payments: the winning combo, plus privacy

Colosseum evidence: MCPay won 1st in Stablecoins with x402 + MCP + stablecoin
payments; Mercantill won on agent audit trails and controls. Neither has privacy.
The pure agent-privacy frameworks (Aegis, Agent-Cred) shipped no product and
lost. Gloam takes MCPay's winning surface and adds the private settlement and
selective disclosure it lacks:

- Add x402 to the MCP server: an agent hits a 402, pays in stablecoins, Gloam
  settles the payment privately through the pool on Tempo.
- Carry Gloam's encrypted note reference in Tempo's native memo field.
- `gloam_execute_private_pay` MCP tool: build a private stablecoin send,
  broadcast, return a disclosure proof the agent can hand an auditor.

## 6. Positioning lines (honest, no mainnet claim)

- Protocol: the privacy layer for onchain finance, for people and the agents
  acting for them.
- Tempo: private, self-custodial stablecoin payments. The permissionless
  complement to Zones, with issuer-compatible selective disclosure.
- Do not claim "Live on Tempo" until the pool is deployed and mainnet is real.
  Testnet only until the production gate is met.

## 7. Open questions and risks

- **Freeze / blocklist enforcement against shielded notes.** Designed: enforce
  issuer controls at the public shield / unshield edges (where tokens actually
  move), keep privacy in the middle. See
  `contracts/audit/TEMPO-COMPLIANCE-DESIGN.md`. Until it ships, only non-freezing
  assets are safe to shield.
- **Native USD decimals on Tempo.** Unconfirmed upstream; verify before writes.
- **World's Fair timing (Sep 14 to Oct 12).** Colosseum explicitly permits
  building up to two months before the start, so building and deploying Tempo
  before Sep 14 is allowed and is not a disqualification risk. Judging weighs
  work shown during the window, so the goal is demoable in-window progress, not
  gating the build to those dates. (Confirmed against Colosseum's official
  guidance, 2026-09-09.)
- **Do Zones make a public-Mainnet shielded pool redundant in judges' eyes?**
  Mitigate by leading with the self-custodial + permissionless + agent lane and
  the compliance-compatible disclosure, which Zones does not offer.

## 8. Sequence

1. Phase 0 (done): runtime network registry, provider, header selector; Tempo
   listed as planned.
2. Design sign-off on section 3 (compliance reconciliation) and section 7
   (freeze path). This is the gate before writing contracts.
3. Phase 1 (build now, keep demoable progress for the window): deploy pool + verifiers on Tempo
   Moderato, register asset, flip `tempo` to live, migrate consumers to
   `useNetwork()`.
4. Phase 2: x402 + MCP private-pay surface.
5. Phase 3: issuer-viewing-key selective disclosure as a headline feature.
