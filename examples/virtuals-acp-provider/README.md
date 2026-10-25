# virtuals-acp-provider

A Gloam provider agent for Virtuals' Agent Commerce Protocol (ACP), offering one
service: **private payout**. Plus a provider that adds its ACP earnings to its
private balance.

A client agent hires the provider with a list of who to pay and how much. The
client funds the job through ACP's escrow as usual. The provider pays each
recipient privately from its Gloam balance and delivers a proof of each payment,
or a claim link for someone with no Gloam address, sealed to the client.

## What stays public

ACP's escrow is a public contract, and this does not change that:

- On chain: the job (client, provider, evaluator, expiry, the offering name
  `gloam_private_payout`), its budget, the client funding the escrow, the hash of
  the deliverable, and the escrow paying the provider and Virtuals' fee.
- On Virtuals' ACP backend: the requirement and the deliverable messages. With
  `sealedPayouts` and `replyTo` both are sealed, so the backend stores ciphertext.

Gloam makes the legs around the escrow private:

- Each payout is a shielded transfer. The chain shows a nullifier and two
  commitments: not the recipient, not the amount, not that this provider sent it
  (the Gloam relay submits it).
- The provider adds its earnings in round batches, so its public deposits do not
  line up with any one job. A recipient's cash out is public and not linked to
  the payout that funded it, but cashing out the exact amount right away makes
  the two easy to match by amount and time.

## The job

```
client                         ACP contract (public)            provider (Gloam)
  | createJob + requirement -------->|                                |
  |                                  |<------ setBudget (quote) ------|
  |---- fund (escrow) -------------->|                                |
  |                                  |       pays each recipient privately
  |                                  |<-- submit(hash of deliverable) |
  |                                  |--- release to provider ------->| add earnings privately
  |<---------------- deliverable sealed to the client ----------------|
```

Requirement, either form (see `src/offering.ts`):

```json
{ "payouts": [{ "to": "gloamr1.…", "amount": "7", "note": "march" },
              { "to": "claim-link", "amount": "3" }],
  "replyTo": "gloamr1.…" }
{ "sealedPayouts": "gloam2t.…", "replyTo": "gloamr1.…" }
```

`buildPayoutRequirement({ payouts, providerAddress, replyTo })` makes the sealed
form. A claim-link payout requires `replyTo`, since the link is the money.

Rules the provider keeps, because it pays before the escrow releases:

- Only jobs with no evaluator (submit then completes the job) or with an
  evaluator its owner trusts.
- It quotes only when one private note covers the whole job.
- The budget covers the payouts, its fee (0.5%, at least 0.05) and Virtuals'
  cut (1% on Base Sepolia, 5% on Base and Robinhood Chain mainnet).
- A job it cannot pay in full is never submitted. ERC-8183 gives a provider no
  reject once funded, so the job expires and the client claims a refund.
- A journal (no secrets) records each payout as it lands, so a restart never
  pays twice.

## Run it on a fork

No keys, no faucets, nothing sent to a live network: anvil forks the chain and
fresh keys are funded inside the fork. Needs Foundry's `anvil`.

```bash
# from the repo root
pnpm install

# Base Sepolia (testnet): Virtuals' ACP testnet contract and Gloam's Base Sepolia vault
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  pnpm --filter gloam-virtuals-acp-provider-example demo:fork

# Robinhood Chain mainnet, forked locally: ACP pays in USDG and Gloam's vault takes USDG,
# so the provider also adds its earnings privately
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
  pnpm --filter gloam-virtuals-acp-provider-example demo:fork -- --network robinhood-mainnet

# tests: unit tests always; the fork tests when the RPC variables are set
pnpm --filter gloam-virtuals-acp-provider-example test
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
  pnpm --filter gloam-virtuals-acp-provider-example test
```

sepolia.base.org answers 200 blocks per log request, so the first read of the
vault there takes about two minutes. On Base Sepolia, ACP's escrow pays in
Virtuals' own test token (`0xECc2…DBb3`), not the Circle test USDC Gloam's vault
takes, so the earnings step reports that and adds nothing. On Base mainnet both
use Circle USDC.

## Run it on ACP

`scripts/live.mts` wires the same provider into `@virtuals-protocol/acp-node-v2`
(0.1.15). It needs a registered ACP agent, its Privy wallet, and
`pnpm add @virtuals-protocol/acp-node-v2@0.1.15` in this folder. Copy
`.env.example` to `.env`. It defaults to ACP's testnet; mainnet needs
`ACP_MAINNET=1`. The agent's wallet policy must allow the Gloam vault and the
token's approve for earnings to go into its private balance.

```ts
const agent = await AcpAgent.create({ evmProvider });
const wallet = new GloamAgent({ network: "robinhood-mainnet", sender: await acpCallSender(evmProvider, 4663) });
const service = new PrivatePayoutProvider({
  wallet,
  budgetToken: (raw, chainId) => AssetToken.usdcFromRaw(raw, chainId),
  acpFeeBps: () => 500,
  earnings: new EarningsSweeper({ wallet, acpPaymentToken: ACP_CONTRACTS[4663].paymentToken }),
});
agent.on("entry", (session, entry) => service.onEntry(session, entry));
await agent.start();
```

## Files

- `src/acp.ts`: the ACP types this needs, matching acp-node-v2 0.1.15, and the contract addresses.
- `src/offering.ts`: the offering record, requirement checks, and the client's `buildPayoutRequirement`.
- `src/provider.ts`: `PrivatePayoutProvider`.
- `src/earnings.ts`: `EarningsSweeper`, earnings into the private balance in round batches.
- `src/forkRoom.ts`: ACP on a fork: the real contract on chain, the job room in process.
- `scripts/scenario.mts`, `scripts/fork-demo.mts`: the whole job on a fork.
