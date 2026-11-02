# Turn on Gloam wallets (Turnkey)

The runbook for switching on Gloam wallets: sign in with an email or a passkey, create
a wallet in one step, then add funds. The wallet's key is made and kept by Turnkey in
secure hardware; the page never sees it and there is no seed phrase. Signing in on any
device opens the same wallet.

Everything is in the code and off. Nothing changes on gloam.trade until
`NEXT_PUBLIC_TURNKEY_ENABLED=true` is set and the app is rebuilt. You set up the Turnkey
dashboard yourself; no agent creates accounts or enters credentials there. Gloam's
servers hold no Turnkey secret: the app talks to Turnkey only through its auth proxy,
with public ids.

## Why sign-in failed before

The auth proxy config only allowed `http://localhost:3000`. From `https://www.gloam.trade`
(where `gloam.trade` redirects) the proxy answered `403 origin not allowed`.
`@turnkey/react-wallet-kit` 2.2.0 swallows that failure, never starts its client, and
its sheet then only says "An underlying error occurred. Try refreshing the page". The
fix is the Allowed Origins setting below. The app now also hides email and passkey
sign-in on any page where the kit fails to start (it offers a browser wallet instead and
logs the reason), and `app/scripts/turnkey-check.mjs` checks the setting before launch.

## 1. Turnkey dashboard

The organization and its auth proxy config already exist (their ids are in Vercel).
In the Turnkey dashboard, under **Embedded Wallets > Configuration**:

| Setting | Value |
| --- | --- |
| Auth proxy | Enabled |
| Allowed Origins | `https://www.gloam.trade`, `https://gloam.trade`, and `http://localhost:3000` for development. Exact URLs: no wildcard, no path, no trailing slash. A Vercel preview needs its own exact URL added before sign-in works there. |
| Email OTP | On |
| Passkey | On |
| Wallet sign-in, SMS, social logins | Off. The app hides them anyway: browser wallets connect through the app's own "Use a wallet". |
| Session expiration | 86400 (one day) is a reasonable start. Today it is 900 (15 minutes). The app refreshes a session while the page is open; a longer session means fewer sign-ins, and longer access for anyone holding the unlocked browser. |
| OTP | 6 digits is fine. Letters and digits (up to 9) is stronger. |
| Email customization | App name `Gloam`; logo `https://www.gloam.trade/brand/logo.png` (PNG, at most 340x124). The app name is required for email sign-in. |
| OAuth redirect URL | Leave empty: no social logins. |

Wallets are not created at sign-up. After the first sign-in the app asks for an optional
name and creates one Ethereum wallet (`m/44'/60'/0'/0/0`), which signs on every chain
Gloam runs on.

### Gas sponsorship (optional)

A new Gloam wallet holds no gas. Claiming a link, receiving a private payment, paying
privately, cashing out and a bridge order paid from Solana or another wallet need none
from it. Adding money privately from the wallet's own public balance does. Turnkey's gas
station can pay that fee, on Robinhood Chain, Base and Ethereum (mainnet and testnet)
among others. On Tempo the fee always comes out of the stablecoin.

To turn it on:

1. In the dashboard, turn on **Gas Sponsorship**.
2. Set an organization-wide limit and a per-sub-organization limit (each Gloam wallet
   is its own sub-organization). Suggested start: $0.50 per wallet per 30 days, and an
   organization cap you are comfortable losing to abuse: anyone with an email can make
   a wallet and spend up to the per-wallet limit. Pay-as-you-go plans cap sponsorship
   at $10 a month and Pro at $25 a month.
3. Set `NEXT_PUBLIC_TURNKEY_SPONSOR_CHAINS` (below).

The app sponsors a send only when the wallet can't pay its own fee, so a wallet that
holds ETH pays its own way. A sponsored wallet delegates to Turnkey's open-source gas
delegate (`0x955D84139e7621bc571b117D8EB5D28A4A222C6f`, EIP-7702); the cash-out check
already treats it as a known delegate.

## 2. Vercel environment

All public, all build-time: redeploy after any change.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` | The organization id (already set) |
| `NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID` | The auth proxy config id (already set) |
| `NEXT_PUBLIC_TURNKEY_ENABLED` | `true` to switch Gloam wallets on. Unset or anything else: off |
| `NEXT_PUBLIC_TURNKEY_SPONSOR_CHAINS` | Optional. Chain ids Turnkey may sponsor, comma-separated, or `all`. Suggested: `4663,8453,46630,84532,11155111`. Add `1` (Ethereum mainnet) only with a limit you accept: its fees are the highest. Unset sponsors nothing. |

## 3. Check before switching on

From `app/`, with the two ids:

```
NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID=... NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID=... node scripts/turnkey-check.mjs
```

It asks the auth proxy for the wallet kit config as each origin's browser would, and
prints `ok` or `FAIL` per origin. Every production origin must say `ok`, with email and
passkey on. It needs no secret and changes nothing.

## 4. Test by hand (on a preview first)

Add the preview's exact URL to Allowed Origins, set the variables on that preview, then:

1. Robinhood Chain testnet: Sign in with an email. The code arrives from Turnkey with the
   Gloam name and logo. The create sheet opens: leave the name empty, Create wallet. Add
   funds opens; the menu shows the address.
2. Sign out from the wallet menu, sign in again with the same email: the same address,
   no create sheet.
3. Sign in with a passkey on a second browser (a new account): create a wallet with a name.
4. Settings > Recovery shows recovery on with the wallet. Get test funds, add privately,
   then sign in on another browser profile with the same email: the private balance comes
   back. If Settings says the wallet "signs differently each time", Turnkey's signatures
   are not deterministic: tell us, and use a passkey for recovery meanwhile.
5. Claim a payment link sent from another wallet: it lands with no gas in the Gloam wallet.
6. Switch networks in the menu (Tempo testnet, Base Sepolia, Ethereum Sepolia, then each
   mainnet): the wallet follows with no prompt and the same address.
7. With sponsorship on: on Base Sepolia, send test USDC to the wallet (no ETH), Add
   privately: approve and deposit go through, and Turnkey's dashboard shows the gas.
   Without sponsorship the app says the wallet has no ETH for the fee and sends nothing.
8. Tempo testnet: send test stablecoins to the wallet, Add privately: the first send sets
   a fee token, then the deposit goes through with the fee taken in the stablecoin.
9. Bridge: on a mainnet, Add funds > Bring money from another chain opens the bridge.
10. Turn Allowed Origins off for the preview (or open a URL not in the list): the app
    offers Connect wallet only, and the console names the origin to add.

## Rolling back

Unset `NEXT_PUBLIC_TURNKEY_ENABLED` (or set it to anything but `true`) and redeploy.
Wallets stay in Turnkey and open again when it is back on. A private balance stays in
the browser and in its recovery backup either way.
