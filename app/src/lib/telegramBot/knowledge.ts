/**
 * What the Telegram helper knows about Gloam. Every line here comes from the
 * repo (README, the docs under app/src/app/docs, and the app's own copy and
 * limits), so the helper never has to guess. When a feature or a limit
 * changes in the app, change it here too.
 *
 * GLOAM_TESTING_OPEN switches the getting-started part: until the owner opens
 * testing, the helper explains what Gloam is but does not walk anyone through
 * starting to test.
 */

/** Links the helper may share. Anything else in a reply is dropped. */
export const OFFICIAL_LINKS = [
  "gloam.trade (website)",
  "gloam.trade/app (the testnet app)",
  "gloam.trade/docs (docs; the testnet guide is gloam.trade/docs/testnet)",
  "gloam.trade/verify (check a proof, no wallet needed)",
  "gloam.trade/testers (apply to be a tester)",
  "gloam.trade/transparency (what anyone can see about the vault)",
  "X: @gloamtrade (x.com/gloamtrade), for news",
  "Email: hello@gloam.trade, for anything private",
  "The community group: t.me/gloamhq",
];

const ABOUT = `
WHAT GLOAM IS
- Gloam is private money on public chains: private stablecoin payments, payroll and proofs. You add money to a shared vault, pay people privately inside it, and cash out with a real zero-knowledge proof. What you hold and how much you move stays private instead of sitting on a public wallet.
- It runs on two testnets: Tempo Moderato testnet (chain ID 42431), a payments chain where you use test stablecoins such as PathUSD and OUSD and fees are paid in stablecoins, and Robinhood Chain testnet (chain ID 46630), with test ETH, sample stock tokens (TSLA, AMZN, PLTR, NFLX, AMD) and USDG. The network selector in the app header switches between them.
- Testnet only. Play money and development proving keys, no real dollars. Mainnet is blocked in the app until a production trusted-setup ceremony and an external audit are done. There is no date.
- Gloam has no token. There is nothing to buy, stake or farm, and no airdrop.
- No middlemen: the vaults have no admin withdraw, so nobody, the team included, can move pooled money. Money leaves only through a cash out with a valid proof. Rule changes are queued on-chain three days before they apply.
- Proofs are made in your browser and take about 10 to 30 seconds. Keep the tab open. A desktop or laptop is best for first proofs.

WHAT STAYS PRIVATE AND WHAT IS PUBLIC
- Private: how much you hold in the vault, who paid whom and how much on a private payment, and the link between a deposit and anything you do later.
- Public: each deposit (Add privately) shows your wallet, the asset and the amount, like any deposit. Each cash out shows the asset, the amount and where it went. A cash out ends privacy for that amount.
- Privacy grows with the number of people using the vault. The testnet vault is still small, so treat it as weaker privacy for now.
- Hide my wallet (the Gloam relay) sends private payments, cash outs and payment notices from Gloam's own account so your wallet does not appear next to them. It is on by default in Payroll and Vault and free on testnet. It cannot take or redirect money: every payment is authorized by a proof made in your browser. If the relay is offline, the app tells you and sends from your wallet instead.

WHAT YOU CAN DO (LIVE ON TESTNET)
- Add privately: move money from your wallet into your private balance (the docs call this shield).
- Private payments: in Move, pay someone's Gloam address (it starts with gloamr1) or make a claim link for someone without one. Anyone with a claim link can claim it, so send it only to that person; you can lock it with a phrase. The person you paid finds it under Receive in Move.
- Cash out: from Move, back to a public wallet. This part is public.
- Private payroll: in Payroll, pick USDG (Robinhood Chain) or PathUSD (Tempo) and upload a CSV with name, gloam_address, amount. A blank address gets a claim link; a public 0x address is refused on purpose. About 8 seconds per person, keep the tab open; if it closes, open Payroll and press Resume. Schedules (monthly, every two weeks, weekly or one time) with a cap per run show a "Payroll due" reminder that runs in one click. Gloam never holds your keys, so it never pays on its own.
- Payment requests: a link or QR that fills in what someone should pay you.
- Proofs, in Prove: Exact balance (one balance, exactly), At least (proof of funds: at least an amount, backed by up to four balances in the same asset), Payment (you received a payment, exact or at least an amount), and Payroll total (a run paid a total to a number of people without showing who got what, up to 32 people per part). Proofs name who they are for and expire after 1, 7 or 30 days. Anyone checks one at gloam.trade/verify with no wallet. Proofs can never move money. An expired proof is not a false one; ask for a fresh one.
- Recovery, in Settings: gets your private balance back on any device just by signing in. Gloam keeps an encrypted copy that only your wallet or passkey can open, and the team cannot read it. Turn it on With your wallet (it asks you to sign twice, free, sends nothing) or With a passkey. A Tempo Wallet (passkey sign-in) account cannot sign a recovery key, so it uses the passkey option. On a new device, choose Restore from your backup and sign in the same way.
- Backups: private balances live in your browser. Clearing site data loses them unless Recovery is on or you exported a backup in Settings. An optional passkey lock protects the balance on that browser. Without Recovery or a backup, a lost balance cannot be brought back by anyone.
- Transparency: gloam.trade/transparency shows what anyone can see about each vault, live from the chain.
- Private trade is switched off for now while a fix lands. Do not promise when it comes back.
- Builders: there is an SDK (@gloamtrade/sdk), an MCP server for AI agents and a partner API. Point them to gloam.trade/docs.
`;

const START_OPEN = `
GETTING STARTED (testing is open)
1. Open gloam.trade/app. On Tempo, tap Sign in to create an account or use your passkey (network fees are covered), or use a browser wallet. On Robinhood Chain, connect a browser wallet like MetaMask or Rabby; passkey accounts live on Tempo only.
2. Claim test funds from Get test funds on Portfolio. On Tempo the button sends test stablecoins straight to your wallet. On Robinhood Chain it opens the Robinhood faucet (test ETH and sample stock tokens, once every 24 hours); test USDG comes from the Paxos faucet linked in the testnet guide.
3. Add privately: on Portfolio, pick an asset and a small amount, then confirm in your wallet.
4. Send a private payment from Move to a friend's Gloam address, or make a claim link. Keep Hide my wallet on.
5. Turn on Recovery in Settings so a cleared browser or a new device never loses your balance.
The full walkthrough is gloam.trade/docs/testnet, and testers share notes in the Testers topic.
`;

const START_CLOSED = `
GETTING STARTED (testing has NOT started yet)
- Group testing has not started. Testing starts soon, and directions and guides will be posted in the Testers topic. Say that when anyone asks how to start, how to get funds, or what to test.
- Do not walk anyone through starting to test, claiming test funds or making payments yet. Explaining what Gloam is and how it works is fine.
- Anyone who wants to be a tester can apply at gloam.trade/testers.
`;

const REWARDS = `
TESTER REWARDS
- Yes, there are rewards for testers. The first group who applied at gloam.trade/testers hold the paid tester spots, and those filled up fast. Everyone who applied after that tests as a volunteer, and the team values that just as much.
- Rewards are paid privately through Gloam to the EVM address given on the form, after testing.
- Do not promise amounts, dates or who got a paid spot. Say Boss Duke and the admins will share the details in Announcements, and that people can check their own application with an admin.
- Tester rewards are not a token or an airdrop. Gloam has no token.
`;

const ISSUES = `
COMMON ISSUES (from the app)
- Tempo faucet says "You already hold ... in test funds": the app skips the faucet once a wallet holds about $50,000 in test stablecoins. That is plenty to test with.
- "Faucet is busy, try again": wait a moment and tap it again. New funds land a few seconds after the faucet answers; the refresh button on Portfolio reloads balances.
- Robinhood faucet: one claim every 24 hours, to the same address you use in Gloam.
- Wrong network: use the network selector. Robinhood Chain testnet is chain ID 46630, Tempo testnet is 42431. Passkey accounts are on Tempo; Robinhood Chain needs a browser wallet.
- "Leave a little ETH for gas": on Robinhood Chain, keep some ETH in the wallet when adding ETH privately.
- Proof stuck or failed: reload, prove in one tab at a time, try a smaller amount, or use a desktop.
- Root or tree mismatch: someone else just used the vault. Wait a few seconds, refresh and try again.
- No private balance after Add privately: check the transaction succeeded on the explorer, hard refresh, and do not clear site data mid-flow.
- A payment does not show for the person paid: they open Move, Receive, to check for payments to their Gloam address, or use the claim link.
- "Your wallet signs differently each time" when turning on Recovery: that wallet cannot hold a recovery key, use a passkey instead.
- "This wallet can't use Gloam.": the app's address checks blocked that wallet. An admin has to look at it.
- RPC errors or rate limits: the public testnet nodes are shared. Wait a minute and retry.

REPORTING BUGS AND WHERE TO GO
- Bugs: post in the Feedback topic, or in Testers with the steps, a screenshot or the explorer link of the transaction. Or type /bug followed by what happened.
- Never post a seed phrase, private key or claim link. A transaction hash or explorer link is fine.
- Questions: the Help topic. Ideas: the Feedback topic. News: Announcements and X @gloamtrade. Anything private: hello@gloam.trade. Website and docs: gloam.trade and gloam.trade/docs.
`;

/** The knowledge block for the system prompt. */
export function knowledgeBlock(testingOpen: boolean): string {
  return [
    ABOUT.trim(),
    (testingOpen ? START_OPEN : START_CLOSED).trim(),
    REWARDS.trim(),
    ISSUES.trim(),
    `OFFICIAL LINKS (the only ones you may share)\n${OFFICIAL_LINKS.map((l) => `- ${l}`).join("\n")}`,
  ].join("\n\n");
}
