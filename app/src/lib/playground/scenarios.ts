/**
 * The SDK playground's three scenarios (/sdk/playground): a tip jar, a
 * checkout and an agent paying an API over x402. Each is a small app as it
 * works today, the same file with @gloamtrade/sdk added, and what a block
 * explorer shows about one payment either way.
 *
 * The code is real. Every "after" file compiles against packages/sdk and is
 * what the Copy button copies; scripts/selftest-sdk-playground.mts typechecks
 * all six files and runs the link builders against the real SDK. Everything
 * else is a simulation: the addresses of people and shops are made up, and
 * nothing here touches a wallet, a chain or the relay. The Gloam relay and
 * vault addresses are the real ones, because that is what an explorer shows
 * for a private payment.
 */

export type ScenarioId = "tip" | "checkout" | "agent";
export type PayMode = "public" | "private";

/** The Gloam relay's wallet: the sender of every relayed private payment. */
export const GLOAM_RELAYER = "0xb1E994586E62994648a0b866BF33F2EDd942512e";
/** The mainnet vault (ShieldPoolPayments), the same address on every chain. */
export const GLOAM_VAULT = "0x39e28cde55cab798874746ac52cb4b5cc99a0194";

/** 0x1234…abcd */
export function shortAddress(a: string): string {
  return a.includes("…") || a.length < 14 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** One line on an address page. A null amount is one the chain never shows. */
export interface HistoryRow {
  when: string;
  what: string;
  /** What anyone can read into it. */
  hint?: string;
  amount: string | null;
}

/** What one click on an address shows. */
export interface AddressPage {
  address: string;
  /** Who it is, in our words. An explorer only knows the address. */
  who: string;
  /** What this page gives away, or keeps. */
  line: string;
  balance: string | null;
  rows: HistoryRow[];
}

export interface Scenario {
  id: ScenarioId;
  tab: string;
  /** One line under the app: what happens. */
  line: string;
  chain: string;
  file: string;
  /** The app's one button. */
  action: string;
  before: string;
  after: string;
  amount: string;
  /** The parties, as the summary names them. */
  payerName: string;
  payeeName: string;
  payer: AddressPage;
  payee: AddressPage;
  /** Where the money goes in the app, today and with Gloam. */
  payTo: Record<PayMode, string>;
  /** The run, step by step, today and with Gloam. */
  steps: Record<PayMode, [string, string, string]>;
  /** The explorer's transaction on first load: the payment as it is today. */
  firstTx: string;
}

// ---------------------------------------------------------------- the code

const TIP_BEFORE = `// tip.ts: the Tip button on your page
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WALLET = "0x9C4e…b21F"; // yours

export function tipLink(amount = "5") {
  // Opens the fan's wallet with a USDG transfer to you.
  const to = \`address=\${WALLET}&uint256=\${amount}e6\`;
  return \`ethereum:\${USDG}@4663/transfer?\${to}\`;
}`;

const TIP_AFTER = `// tip.ts: the Tip button on your page
import { buildPaymentRequestLink } from "@gloamtrade/sdk";

const GLOAM_ADDRESS = "gloamr1.…"; // yours, under Receive in the app

export function tipLink(amount = "5") {
  // Opens Gloam with the tip filled in. The fan pays from a private balance.
  return buildPaymentRequestLink({
    payTo: GLOAM_ADDRESS,
    network: "robinhood-mainnet",
    asset: "USDG",
    amount,
    note: "tip",
  });
}`;

const CHECKOUT_BEFORE = `// checkout.ts: on your server
import { erc20Abi, type PublicClient } from "viem";

const USDC_E = "0x20c000000000000000000000b9537d11c60e8b50";

export type Shop = {
  wallet: \`0x\${string}\`; // where customers pay
  client: PublicClient;
};

// The Pay button on invoice \`id\`.
export function invoiceLink(shop: Shop, id: string, amount: string) {
  // The payment can't carry the id. Match it by amount and time.
  const to = \`address=\${shop.wallet}&uint256=\${amount}e6\`;
  return \`ethereum:\${USDC_E}@4217/transfer?\${to}\`;
}

// Mark invoices paid as payments to the shop land.
export function markPaid(shop: Shop, onPaid: (from: string, amountWei: bigint) => void) {
  return shop.client.watchContractEvent({
    address: USDC_E,
    abi: erc20Abi,
    eventName: "Transfer",
    args: { to: shop.wallet },
    onLogs: (logs) => logs.forEach((l) => onPaid(l.args.from!, l.args.value!)),
  });
}`;

const CHECKOUT_AFTER = `// checkout.ts: on your server
import {
  buildPaymentRequestLink, mainnetNetwork, notePackageToExport, relaySubmitter,
  scanIncomingPayments, sweepChainFromClient, sweepReceivedNote, TEMPO_USDCE,
  type NoteExport, type Prover, type ReceiveKey,
} from "@gloamtrade/sdk";
import type { PublicClient } from "viem";

const net = mainnetNetwork("tempo")!;

export type Shop = {
  key: ReceiveKey; // generateReceiveKey(). Your Gloam address is key.tag
  client: PublicClient;
  prove: Prover; // artifactProver(), transfer circuit
  keep: (note: NoteExport) => Promise<void>; // save to your database
};

// The Pay button on invoice \`id\`.
export function invoiceLink(shop: Shop, id: string, amount: string) {
  return buildPaymentRequestLink({
    payTo: shop.key.tag,
    network: net,
    asset: "USDC.e",
    amount,
    note: id, // travels sealed in the payment, for the shop only
  });
}

// Mark invoices paid as payments to the shop land.
export async function markPaid(shop: Shop, onPaid: (id: string, amountWei: bigint) => void) {
  const { client, key, prove, keep } = shop;
  const { payments } = await scanIncomingPayments({ client, network: net, receiveKey: key });
  for (const p of payments) {
    // Move it to a balance only the shop knows, so the payer can't take it back.
    const swept = await sweepReceivedNote({
      note: await notePackageToExport(p.notePackage),
      poolAddress: net.pool,
      chainId: net.chainId,
      prove,
      chain: sweepChainFromClient(client, { pool: net.pool, fromBlock: net.deployBlock }),
      submit: relaySubmitter(),
      beforeSubmit: keep,
    });
    const usdc = p.asset.toLowerCase() === TEMPO_USDCE.toLowerCase();
    if (swept.final && usdc && p.note) onPaid(p.note, BigInt(p.amountWei));
  }
}`;

const AGENT_BEFORE = `// agent.ts: call an API that charges per request
import { erc20Abi, type Account, type WalletClient } from "viem";

export type Payer = {
  client: WalletClient;
  account: Account;
};

export async function paidFetch(url: string, payer: Payer) {
  const res = await fetch(url);
  if (res.status !== 402) return res;
  const price = await res.json();

  // Pay from the agent's wallet.
  const hash = await payer.client.writeContract({
    account: payer.account,
    chain: payer.client.chain,
    address: price.asset,
    abi: erc20Abi,
    functionName: "transfer",
    args: [price.payTo, BigInt(price.maxAmountRequired)],
  });
  return fetch(url, { headers: { "X-PAYMENT": hash } });
}`;

const AGENT_AFTER = `// agent.ts: call an API that charges per request
import { buildGloamPayment, encodePaymentHeader, relayIntent } from "@gloamtrade/sdk";
import type { NoteExport, Prover, SyncedTree } from "@gloamtrade/sdk";
import type { PublicClient } from "viem";

export type Payer = {
  client: PublicClient;
  note: NoteExport; // the agent's private balance
  tree: SyncedTree; // syncTree(client, { pool, fromBlock })
  prove: Prover; // artifactProver(), transfer circuit
  keep: (change: NoteExport) => Promise<void>; // save what is left
};

export async function paidFetch(url: string, payer: Payer) {
  const res = await fetch(url);
  if (res.status !== 402) return res;
  const price = await res.json();

  // Pay from the agent's private balance, through the Gloam relay.
  const { note, tree, prove } = payer;
  const path = await tree.pathForCommitment(note.commitment);
  if (!path) throw new Error("That balance is not in the vault yet.");
  const pay = await buildGloamPayment({
    requirements: price,
    senderSecretHex: note.secret,
    senderNoteAmountWei: BigInt(note.amountWei),
    path,
    prove,
  });
  await payer.keep(pay.changeNote);
  const hash = await relayIntent(pay.intent);
  await payer.client.waitForTransactionReceipt({ hash });
  pay.payload.payload.txHash = hash;
  return fetch(url, { headers: { "X-PAYMENT": encodePaymentHeader(pay.payload) } });
}`;


// ---------------------------------------------------------------- the scenarios

export const SCENARIOS: Scenario[] = [
  {
    id: "tip",
    tab: "Tip jar",
    line: "A fan tips a writer 5 USDG.",
    chain: "Robinhood Chain",
    file: "tip.ts",
    action: "Tip 5 USDG",
    before: TIP_BEFORE,
    after: TIP_AFTER,
    amount: "5.00 USDG",
    payerName: "the fan",
    payeeName: "the writer",
    payer: {
      address: "0xA11c…7e21",
      who: "The fan",
      line: "Their pay, their rent and everyone they pay, one click from a tip.",
      balance: "8,412.50 USDG",
      rows: [
        { when: "Just now", what: "To 0x9C4e…b21F", amount: "−5.00" },
        { when: "2 days ago", what: "From 0x5d2E…0a91", hint: "Same day each month", amount: "+4,200.00" },
        { when: "4 days ago", what: "To 0x7B10…c3e4", hint: "Same amount each month", amount: "−1,450.00" },
        { when: "6 days ago", what: "To 0x3f8A…92d0", amount: "−38.20" },
      ],
    },
    payee: {
      address: "0x9C4e…b21F",
      who: "The writer",
      line: "Every tip, who sent it, and what the writer makes.",
      balance: "3,906.00 USDG",
      rows: [
        { when: "Just now", what: "From 0xA11c…7e21", amount: "+5.00" },
        { when: "3 min ago", what: "From 0x62b0…f4a8", amount: "+10.00" },
        { when: "18 min ago", what: "From 0xD03e…1c57", amount: "+2.00" },
        { when: "1 hour ago", what: "From 0x18Fa…aa02", amount: "+5.00" },
      ],
    },
    payTo: { public: "Tips go to 0x9C4e…b21F", private: "Tips go to a Gloam address" },
    steps: {
      public: ["Signed in the fan's wallet", "Sent from 0xA11c…7e21", "Tip received"],
      private: ["Proof made on the fan's device", "Sent through the Gloam relay", "Tip received, privately"],
    },
    firstTx: "0x7f3a9c0e5b21d84f6a0c3e19b7d5f2a48c61e0b93d7a25f4e8c1b06d39a2c91d",
  },
  {
    id: "checkout",
    tab: "Checkout",
    line: "A customer pays a 120 USDC.e invoice.",
    chain: "Tempo",
    file: "checkout.ts",
    action: "Pay invoice",
    before: CHECKOUT_BEFORE,
    after: CHECKOUT_AFTER,
    amount: "120.00 USDC.e",
    payerName: "the customer",
    payeeName: "the shop",
    payer: {
      address: "0x4E7d…a903",
      who: "The customer",
      line: "What they earn, what they spend, and where.",
      balance: "22,180.00 USDC.e",
      rows: [
        { when: "Just now", what: "To 0x2B9f…61Cc", amount: "−120.00" },
        { when: "1 day ago", what: "From 0x0c55…e1b4", hint: "Every two weeks", amount: "+6,800.00" },
        { when: "3 days ago", what: "To 0xAa31…5d09", amount: "−2,300.00" },
        { when: "8 days ago", what: "To 0x2B9f…61Cc", hint: "A regular at this shop", amount: "−85.00" },
      ],
    },
    payee: {
      address: "0x2B9f…61Cc",
      who: "The shop",
      line: "Every customer, every sale, and who the shop pays.",
      balance: "48,960.00 USDC.e",
      rows: [
        { when: "Just now", what: "From 0x4E7d…a903", amount: "+120.00" },
        { when: "12 min ago", what: "From 0x77c9…02fe", amount: "+340.00" },
        { when: "40 min ago", what: "From 0x1b6D…c8a3", amount: "+95.00" },
        { when: "2 hours ago", what: "To 0x5f0A…7712", hint: "Its supplier", amount: "−12,000.00" },
      ],
    },
    payTo: { public: "Pay to 0x2B9f…61Cc", private: "Pay to a Gloam address" },
    steps: {
      public: ["Signed in the customer's wallet", "Sent from 0x4E7d…a903", "Invoice 1042 paid"],
      private: ["Proof made on the customer's device", "Sent through the Gloam relay", "Invoice 1042 paid, privately"],
    },
    firstTx: "0x2c8e41f07a9b3d65e0f1a2c4b8d7e9036a5c1f4e2b0d9a8c7e6f5d4c3b2a1908",
  },
  {
    id: "agent",
    tab: "Agent API",
    line: "An agent pays 0.25 USDC.e for one API call, over x402.",
    chain: "Tempo",
    file: "agent.ts",
    action: "Call the API",
    before: AGENT_BEFORE,
    after: AGENT_AFTER,
    amount: "0.25 USDC.e",
    payerName: "the agent",
    payeeName: "the API",
    payer: {
      address: "0x6Fa2…d0B3",
      who: "The agent",
      line: "Every API it pays, how often and how much. That is its strategy.",
      balance: "1,240.75 USDC.e",
      rows: [
        { when: "Just now", what: "To 0x0dE5…77A1", amount: "−0.25" },
        { when: "1 min ago", what: "To 0x0dE5…77A1", hint: "Calls it every minute", amount: "−0.25" },
        { when: "1 min ago", what: "To 0xC1a9…4e60", amount: "−1.00" },
        { when: "2 min ago", what: "To 0x88b2…f13d", amount: "−0.05" },
      ],
    },
    payee: {
      address: "0x0dE5…77A1",
      who: "The API",
      line: "Every agent that calls it, and what each one pays.",
      balance: "9,812.40 USDC.e",
      rows: [
        { when: "Just now", what: "From 0x6Fa2…d0B3", amount: "+0.25" },
        { when: "1 min ago", what: "From 0x6Fa2…d0B3", amount: "+0.25" },
        { when: "1 min ago", what: "From 0x3D4c…9a1e", amount: "+0.25" },
        { when: "2 min ago", what: "From 0xE90f…6b52", amount: "+0.25" },
      ],
    },
    payTo: { public: "Pays from 0x6Fa2…d0B3", private: "Pays from a private balance" },
    steps: {
      public: ["402: pay 0.25 USDC.e to call it", "Paid from 0x6Fa2…d0B3", "200: summary delivered"],
      private: ["402: pay 0.25 USDC.e to call it", "Proof made, sent through the relay", "200: summary delivered"],
    },
    firstTx: "0x9d0b7e2a4c6f8135e7a9c0b2d4f6e8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d2",
  },
];

export function scenarioById(id: ScenarioId): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
}

/** The relay's page: what one click on the sender of a private payment shows. */
export function relayPage(): AddressPage {
  return {
    address: shortAddress(GLOAM_RELAYER),
    who: "Gloam relay",
    line: "It sends private payments into the vault for everyone who uses Gloam. It can send one or refuse it, never redirect it.",
    balance: null,
    rows: [
      { when: "Just now", what: "Private payment", amount: null },
      { when: "1 min ago", what: "Private payment", amount: null },
      { when: "1 min ago", what: "Private payment", amount: null },
      { when: "3 min ago", what: "Private payment", amount: null },
    ],
  };
}

/** The vault's page. Money in and out is public; payments inside are not. */
export function vaultPage(token: string): AddressPage {
  return {
    address: shortAddress(GLOAM_VAULT),
    who: "Gloam vault",
    line: "It holds everyone's private balances. Money added and cashed out shows here. Payments inside show no amount.",
    balance: null,
    rows: [
      { when: "Just now", what: "Private payment", amount: null },
      { when: "2 min ago", what: `Added from 0x8e17…3b90`, amount: `+250.00 ${token}` },
      { when: "6 min ago", what: "Private payment", amount: null },
      { when: "14 min ago", what: `Cashed out to 0x41f2…07dd`, amount: `−90.00 ${token}` },
    ],
  };
}

/** The token symbol of a scenario's amount ("5.00 USDG" → "USDG"). */
export function tokenOf(s: Scenario): string {
  return s.amount.split(" ").slice(1).join(" ");
}

/** The names a file imports from @gloamtrade/sdk, values and types apart. */
export function sdkImports(code: string): { values: string[]; types: string[] } {
  const values: string[] = [];
  const types: string[] = [];
  const re = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*"@gloamtrade\/sdk"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const allTypes = Boolean(m[1]);
    for (const raw of m[2]!.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const isType = allTypes || part.startsWith("type ");
      const name = part.replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      (isType ? types : values).push(name);
    }
  }
  return { values, types };
}
