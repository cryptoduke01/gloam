# @gloamtrade/game-plugin-gloam

Private stablecoin payments for Virtuals agents, built on the GAME framework.

An agent gets a private balance in Gloam's vault and can pay, get paid, cash
out and prove what it holds, without its payments and balance being public. It
works on Base and Robinhood Chain, the chains Virtuals agents use, under spending
limits its owner sets per asset and the agent cannot lift.

The plugin follows the pattern of the plugins in `game-node/plugins`: a class
with options, one getter per `GameFunction`, and `getWorker()`.

## Networks

| `GLOAM_NETWORK` | Network | Assets |
|---|---|---|
| `base` (default) | Base Sepolia, testnet | USDC, EURC, ETH |
| `robinhood-mainnet` | Robinhood Chain, mainnet | USDG, GLOAM |
| `base-mainnet` | Base, mainnet, once Gloam's Base vault is live | USDC, EURC, USDT, ETH |

The same vault address on each: `0x39e28cde55cab798874746ac52cb4b5cc99a0194`.
Mainnet is in beta, with deposit limits (500 of a stablecoin per deposit).

## Install

```bash
pnpm add @gloamtrade/game-plugin-gloam @virtuals-protocol/game
```

## Use

```ts
import { GameAgent } from "@virtuals-protocol/game";
import GloamPlugin from "@gloamtrade/game-plugin-gloam";

const gloam = new GloamPlugin({
  limits: {
    recipients: "any",
    assets: { USDC: { maxPerPayment: "5", maxPerDay: "20" } },
  },
  // Claim links are the money itself: they come to your code, never to the planner.
  onClaimLink: (c) => deliverSomehow(c.link),
});

const agent = new GameAgent(process.env.GAME_API_KEY!, {
  name: "Private Treasurer",
  goal: "Pay suppliers privately and prove funds when asked.",
  description: "Pays and gets paid with Gloam.",
  workers: [gloam.getWorker()],
});
await agent.init();
await agent.run(10, { verbose: true });
```

Environment (the agent's own, never passed through the planner):

```bash
GLOAM_NETWORK=base                      # or robinhood-mainnet
GLOAM_AGENT_PRIVATE_KEY=0x...           # the wallet that holds public funds and signs deposits
GLOAM_LIMITS_FILE=./limits.json         # or pass `limits` in code
# GLOAM_NOTE_KEY=...                    # store key; derived from the agent key when unset
# GLOAM_SUBMIT=wallet                   # default relay: the Gloam relay submits private sends
```

An ACP agent's Privy smart wallet can be the sender instead of a local key:
`new GloamPlugin({ sender: await acpCallSender(evmProvider, chainId) })`.

## Functions

| Function | What it does | Public on chain |
|---|---|---|
| `gloam_private_balance` | Private balance per asset, wallet balance, Gloam address, limits left today | Nothing |
| `gloam_add_privately` | Deposit from the wallet into the private balance | The deposit: wallet, asset, amount |
| `gloam_pay_privately` | Pay a Gloam address (`gloamr1.…`), a payment request link, or by claim link | A shielded transfer only |
| `gloam_receive` | `address`, `request` (a payment request link), `check` (pick up payments sent to it), `claim` (a claim link) | A shielded transfer only |
| `gloam_cash_out` | Private balance to a 0x address (0.25% fee on mainnet and Base Sepolia) | The exit: asset, amount, recipient |
| `gloam_prove_funds` | A proof it holds at least an amount, for one named reader | Nothing |
| `gloam_verify_proof` | Check a `gloamfunds1:` or `gloampay1:` proof against the chain | Nothing |

A payment spends one note, so the most one payment can be is the largest note
(`largestPayment` in the balance). A received payment counts only once it has
been moved into a fresh note only this agent knows.

The engine is `GloamAgent` (`plugin.agent`), usable without GAME: `add`, `pay`,
`payByClaimLink`, `requestPayment`, `checkIncoming`, `claim`, `cashOut`,
`proveFunds`, `provePayment`, `verifyProof`.

## Limits

```json
{
  "recipients": "any",
  "actions": ["add", "pay", "cash_out"],
  "expiresAt": "2026-12-31",
  "assets": {
    "USDC": { "maxPerPayment": "5", "maxPerDay": "20" },
    "ETH": { "maxPerPayment": "0.002", "maxPerDay": "0.01" }
  }
}
```

- Every asset has its own caps, in its own units. A single cap for all assets
  is refused: "50" would mean 50 USDC and 50 ETH.
- Caps cover payments and cash outs over a rolling 24 hours. Adding to its own
  private balance is allowed or not (`actions`), never capped.
- `recipients` is `"any"` or a list of Gloam addresses, 0x addresses (cash outs)
  and `"claim-link"`.
- No limits means nothing moves. The MCP server's limits file
  (`{ "agents": { "<id>": … } }`, keyed by `GLOAM_AGENT_ID`) works too, as long
  as each asset has its own caps.
- The limits are enforced by this plugin before it signs. The vault contract
  does not know them, so they bind the agent, not whoever holds its key.

## Keys and secrets

- The agent's key comes from its environment. No function takes a key, a note
  or a secret as an argument.
- Notes live in an encrypted file on the agent's machine (AES-256-GCM,
  `~/.gloam/game-notes.<agent>.json`), named to the planner only by handle.
- Every text a function returns, and every log line, is checked for known
  secrets and claim codes before it leaves. The GAME planner is a hosted LLM:
  it sees amounts, handles, hashes, Gloam addresses and proofs. Pass
  `shareBalances: false` to keep balances out of the environment it reads.

## Test

```bash
pnpm --filter @gloamtrade/game-plugin-gloam test
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org pnpm --filter @gloamtrade/game-plugin-gloam test:fork
```

The fork test runs every flow against the Base Sepolia vault inside a local
anvil fork, with fresh keys funded in the fork. It needs Foundry's `anvil`.
sepolia.base.org answers 200 blocks per log request, so its first vault read
takes about two minutes; the leaf cache makes later reads quick.

## Troubleshooting

- `limits_unset`: pass `limits` or set `GLOAM_LIMITS_FILE`.
- "No single private note holds …": add more privately, or pay less than `largestPayment`.
- "has no Gloam pool in this version": update `@gloamtrade/sdk` (Base mainnet appears once its vault is live).
- A slow first call: the vault tree is being read; it is cached under `~/.gloam/vault-cache`.

MIT licensed.
