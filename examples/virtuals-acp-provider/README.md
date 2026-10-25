# virtuals-acp-provider

A Gloam provider agent for Virtuals' Agent Commerce Protocol (ACP), offering one
service: **private payout**. Plus a provider that adds its ACP earnings to its
private balance.

A client agent hires the provider with a list of who to pay and how much. The
provider pays each recipient privately from its Gloam balance and delivers a
proof of each payment, or a claim link for someone with no Gloam address,
sealed to the client.

## What stays public

ACP's contracts are public, and this does not change that:

- On chain: the job (client, provider, evaluator, expiry, the offering name
  `gloam_private_payout`), the fee in escrow, the payout total moving from the
  client to the provider when the job is funded, the hash of the deliverable,
  and the escrow paying the fee and ACP's cut.
- On Virtuals' ACP backend: the requirement and the deliverable messages. With
  `sealedPayouts` and `replyTo` both are sealed, so the backend stores ciphertext.

Gloam makes the legs around ACP private:

- Each payout is a shielded transfer. The chain shows a nullifier and two
  commitments: not the recipient, not the amount, not that this provider sent it
  (the Gloam relay submits it).
- The provider pays from a private float, and adds what it received in round
  batches later, so its public deposits do not line up with any one job. A
  recipient's cash out is public and not linked to the payout that funded it,
  but cashing out the exact amount right away makes the two easy to match.

## The job

```
client                               ACP (public)                           provider (Gloam)
  | createJob(hook: FundTransferHook,    |                                        |
  |   evaluator: client) + requirement ->|                                        |
  |                                      |<-- setBudget(fee) + fund request ------|
  |-- fund: fee into escrow, ----------->|--- payout total to provider --------->|
  |                                      |               pays each recipient privately
  |                                      |<-------- submit(hash of deliverable) --|
  |<------------- deliverable, sealed to the client ------------------------------|
  |-- complete (after checking proofs) ->|--- fee to provider ------------------->| adds received money privately
```

The offering sets `requiredFunds`, so acp-node-v2's `createJobFromOffering`
creates the job with ACP's FundTransferHook: the payout total goes from the
client to the provider inside the same `fund()` transaction, outside the
escrow, and only the provider's fee is escrowed. The client evaluates its own
job, as acp-node-v2's fund-transfer examples do.

Why: the provider pays out before it submits, and an escrow can still go back
to the client before then (a self-evaluating client may reject a funded job).
Private payouts cannot be undone, so they never depend on the escrow. A client
that rejects after funding gets the fee back from the escrow, and the provider
sends back any principal it has not paid out yet. Plain escrow jobs are taken
only from clients the owner trusts.

Requirement, either form (see `src/offering.ts`):

```json
{ "payouts": [{ "to": "gloamr1.…", "amount": "7", "note": "march" },
              { "to": "claim-link", "amount": "3" }],
  "replyTo": "gloamr1.…" }
{ "sealedPayouts": "gloam2t.…", "replyTo": "gloamr1.…" }
```

`buildPayoutRequirement({ payouts, providerAddress, replyTo })` makes the sealed
form. A claim-link payout requires `replyTo`, since the link is the money.

Other rules the provider keeps:

- It quotes only when one private note covers the whole job.
- The fee is 0.5% (at least 0.05), grossed up for ACP's cut, read from the
  contract (platform 1% on Base Sepolia, 5% on Base and Robinhood Chain mainnet,
  plus 5% to the evaluator, here the client).
- A job it cannot pay in full is never submitted; it expires, the fee goes back,
  and the provider sends back what it did not pay out.
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

# Robinhood Chain mainnet, forked locally: both legs in USDG
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
  pnpm --filter gloam-virtuals-acp-provider-example demo:fork -- --network robinhood-mainnet

# tests: unit tests always; the fork tests when the RPC variables are set
pnpm --filter gloam-virtuals-acp-provider-example test
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com \
  pnpm --filter gloam-virtuals-acp-provider-example test
```

Each run makes one job that completes, one plain escrow job the provider
refuses, and one job the client rejects after funding. sepolia.base.org answers
200 blocks per log request, so the first read of the vault there takes a few
minutes. On Base Sepolia, ACP's escrow takes the fee in Virtuals' own test
token (`0xECc2…DBb3`), which Gloam's vault does not take, so only the payout
total (Circle's test USDC) is added privately. On Base mainnet both are Circle
USDC.

## Run it on ACP

`scripts/live.mts` wires the same provider into `@virtuals-protocol/acp-node-v2`
(0.1.15). It needs a registered ACP agent, its Privy wallet, and
`pnpm add @virtuals-protocol/acp-node-v2@0.1.15` in this folder. Copy
`.env.example` to `.env`. It defaults to ACP's testnet; mainnet needs
`ACP_MAINNET=1`. The agent's wallet policy must allow the Gloam vault and the
token's approve for received money to go into its private balance.

```ts
const agent = await AcpAgent.create({ evmProvider });
const wallet = new GloamAgent({ network: "robinhood-mainnet", sender: await acpCallSender(evmProvider, 4663) });
const service = new PrivatePayoutProvider({
  wallet,
  budgetToken: (raw, chainId) => AssetToken.usdcFromRaw(raw, chainId),
  transferToken: (address, symbol, decimals, raw) => AssetToken.create(address, symbol, decimals, Number(raw) / 10 ** decimals),
  acpFeeBps: () => 1000, // platform 5% + evaluator 5%
  earnings: new EarningsSweeper({ wallet, tokens: [ACP_CONTRACTS[4663].paymentToken] }),
});
agent.on("entry", (session, entry) => service.onEntry(session, entry));
await agent.start();
```

## Files

- `src/acp.ts`: the ACP types this needs, matching acp-node-v2 0.1.15, and the contract and hook addresses.
- `src/offering.ts`: the offering record, requirement checks, and the client's `buildPayoutRequirement`.
- `src/provider.ts`: `PrivatePayoutProvider`.
- `src/earnings.ts`: `EarningsSweeper`, received money into the private balance in round batches.
- `src/forkRoom.ts`: ACP on a fork: the real contract and hook on chain, the job room in process.
- `scripts/scenario.mts`, `scripts/fork-demo.mts`: the whole job on a fork.
