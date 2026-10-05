/**
 * Reference agent payment over x402, private end to end, using only
 * @gloamtrade/sdk. A seller prices a resource (the 402 challenge) to its receive
 * tag; a buyer agent shields a note to fund itself, builds a PRIVATE payment of
 * the required amount sealed to that tag, broadcasts it itself (self-custodial,
 * no operator holds its key), and presents the X-PAYMENT header. The seller
 * opens the payment, verifies it, and sweeps it into a fresh note only the
 * seller knows. It serves only after that sweep confirms: the buyer created the
 * payment note, so until then the buyer could spend it back.
 *
 * This is the pattern that won Colosseum (x402 + stablecoins) with the
 * settlement made private: the amount and the parties never go on the public
 * feed. This is NOT a Tempo Zone: no operator sees the payment; only the payer
 * and the payee learn the amount.
 *
 *   GLOAM_PAY_KEY=0x<funded RH testnet key> \
 *     npx tsx examples/pay-x402/pay-x402.ts
 *
 * The demo settles on Robinhood testnet (asset: native ETH), because that pool
 * is live. On Tempo the identical flow settles a stablecoin; only the asset and
 * the chain config differ.
 */
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildShieldBoundIntent,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  generateReceiveKey,
  settleGloamPayment,
  sweepChainFromClient,
  relaySubmitter,
  transferCallArgs,
  POOL_TRANSFER_ABI,
  encodePaymentHeader,
  decodePaymentHeader,
  artifactProver,
  syncTree,
  SEALED_VAULT,
  NATIVE_ASSET,
  RH_TESTNET_CHAIN_ID,
} from "@gloamtrade/sdk";

// Defaults target Robinhood testnet (native ETH). Override via env to run on
// another chain. Tempo Moderato blocks native msg.value, so shield an ERC-20
// stablecoin there (e.g. PathUSD, 6 decimals):
//   GLOAM_RPC=https://rpc.moderato.tempo.xyz GLOAM_CHAIN_ID=42431 \
//   GLOAM_POOL=0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb GLOAM_DEPLOY_BLOCK=37411195 \
//   GLOAM_ASSET=0x20c0000000000000000000000000000000000000 \
//   GLOAM_DECIMALS=6 GLOAM_ASSET_SYMBOL=PathUSD
const RPC = process.env.GLOAM_RPC ?? "https://rpc.testnet.chain.robinhood.com";
const CHAIN_ID = Number(process.env.GLOAM_CHAIN_ID ?? RH_TESTNET_CHAIN_ID);
const POOL = (process.env.GLOAM_POOL ?? SEALED_VAULT) as `0x${string}`;
// RH hardened pool 0xAc25… deploy block (matches SEALED_VAULT default).
const DEPLOY_BLOCK = BigInt(process.env.GLOAM_DEPLOY_BLOCK ?? "126185021");
const ASSET = (process.env.GLOAM_ASSET ?? NATIVE_ASSET) as `0x${string}`;
const DECIMALS = Number(process.env.GLOAM_DECIMALS ?? "18");
const ASSET_SYMBOL = process.env.GLOAM_ASSET_SYMBOL ?? "ETH";
const IS_NATIVE = ASSET.toLowerCase() === NATIVE_ASSET.toLowerCase();
const here = dirname(fileURLToPath(import.meta.url));
const art = (name: string) => resolve(here, "../../app/public/circuits/", name);

const chain = defineChain({
  id: CHAIN_ID,
  name: `Gloam chain ${CHAIN_ID}`,
  nativeCurrency: { name: ASSET_SYMBOL, symbol: ASSET_SYMBOL, decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const shieldBoundAbi = [
  {
    type: "function",
    name: "shieldBound",
    stateMutability: "payable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main() {
  const pk = process.env.GLOAM_PAY_KEY;
  if (!pk) throw new Error("Set GLOAM_PAY_KEY (a funded RH testnet key).");
  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`
  );
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const pub = createPublicClient({ chain, transport: http(RPC) });

  // ── Seller: a receive key, and the price (the 402 challenge) ───────────────
  // A real seller makes its key once and keeps the private half server-side.
  const seller = await generateReceiveKey();
  const price = parseUnits("0.0002", DECIMALS);
  const requirements = buildGloamPaymentRequirements({
    amountWei: price,
    asset: ASSET,
    assetSymbol: ASSET_SYMBOL,
    payTo: seller.tag, // payments are sealed to this; only the seller can open them
    resource: "mcp://gloam/tool/summarize",
    description: "One private summarize call",
    poolAddress: POOL,
    network: CHAIN_ID,
  });
  console.log("402 Payment Required:");
  console.log(`  price ${formatUnits(price, DECIMALS)} ${requirements.assetSymbol} to ${requirements.payTo.slice(0, 24)}…`);
  console.log(`  ${requirements.privacy.oneLine}\n`);

  // ── Buyer: shield a note to fund itself ────────────────────────────────────
  const fund = parseUnits("0.0005", DECIMALS);
  // Precheck funding so an underfunded wallet fails clearly. A native shield
  // attaches its amount as msg.value; an ERC-20 shield pulls via transferFrom
  // after approve. Either way the wallet also needs native balance for gas.
  const gas = await pub.getBalance({ address: account.address });
  if (gas === 0n) {
    throw new Error(`Wallet ${account.address} has no native balance for gas. Fund it first.`);
  }
  if (IS_NATIVE) {
    const needed = fund + parseUnits("0.0004", DECIMALS);
    if (gas < needed) {
      throw new Error(
        `Wallet ${account.address} has ${formatUnits(gas, DECIMALS)} but needs about ${formatUnits(needed, DECIMALS)} (shield amount plus gas). Top up at the faucet.`
      );
    }
  } else {
    const tokenBal = await pub.readContract({
      address: ASSET,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (tokenBal < fund) {
      throw new Error(
        `Wallet ${account.address} holds ${formatUnits(tokenBal, DECIMALS)} ${ASSET_SYMBOL} but needs ${formatUnits(fund, DECIMALS)}. Fund it from the faucet.`
      );
    }
  }
  console.log(`Buyer ${account.address} shielding ${formatUnits(fund, DECIMALS)} ${ASSET_SYMBOL} to fund the payment…`);
  const shield = await buildShieldBoundIntent({
    amountWei: fund,
    asset: ASSET,
    poolAddress: POOL,
    prover: artifactProver({ wasm: art("shield.wasm"), zkey: art("shield_final.zkey") }),
  });
  // ERC-20 shields need an allowance so the pool can pull the tokens.
  if (!IS_NATIVE) {
    const approveHash = await wallet.writeContract({
      address: ASSET,
      abi: erc20Abi,
      functionName: "approve",
      args: [POOL, fund],
    });
    await pub.waitForTransactionReceipt({ hash: approveHash });
  }
  const shieldHash = await wallet.writeContract({
    address: shield.exec.poolAddress,
    abi: shieldBoundAbi,
    functionName: "shieldBound",
    args: shield.exec.args as readonly [`0x${string}`, bigint, `0x${string}`, `0x${string}`],
    value: shield.exec.valueWei,
  });
  await pub.waitForTransactionReceipt({ hash: shieldHash });

  // ── Buyer: sync the tree and build the private x402 payment ────────────────
  const synced = await syncTree(pub, { pool: POOL, fromBlock: DEPLOY_BLOCK });
  const path = await synced.pathForCommitment(shield.note.commitment);
  if (!path) throw new Error("Source note not in the tree yet — retry in a moment.");

  const payment = await buildGloamPayment({
    requirements,
    senderSecretHex: shield.note.secret,
    senderNoteAmountWei: fund,
    path,
    prove: artifactProver({ wasm: art("transfer.wasm"), zkey: art("transfer_final.zkey") }),
    issuerTag: "issuer:demo", // optional issuer-scoped compliance disclosure
  });

  // ── Buyer: settle the payment itself, then attach the tx hash ──────────────
  console.log("Settling the private payment (self-custodial)…");
  const sendHash = await wallet.writeContract({
    address: payment.intent.exec.poolAddress,
    abi: POOL_TRANSFER_ABI,
    functionName: "transfer",
    args: transferCallArgs(payment.intent),
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: sendHash });
  if (receipt.status !== "success") throw new Error("Transfer reverted.");
  payment.payload.payload.txHash = sendHash;

  // ── Seller: open, verify and sweep the presented X-PAYMENT, then serve ─────
  // The agent attaches the settlement tx, then presents the header on the retry.
  const presented = decodePaymentHeader(encodePaymentHeader(payment.payload));
  // settleGloamPayment opens the sealed note with the seller's key, checks it
  // binds the price and asset in the right pool, then moves it into a fresh note
  // only the seller knows. The sweep goes through the Gloam relay when
  // GLOAM_RELAY_URL is set, else the seller's own wallet (here the same key).
  const relayUrl = process.env.GLOAM_RELAY_URL?.trim();
  const settled = await settleGloamPayment({
    requirements,
    payload: presented,
    receiveKey: seller,
    prove: artifactProver({ wasm: art("transfer.wasm"), zkey: art("transfer_final.zkey") }),
    chain: sweepChainFromClient(pub, { pool: POOL, fromBlock: DEPLOY_BLOCK }),
    submit: relayUrl
      ? relaySubmitter({ url: relayUrl })
      : (intent) =>
          wallet.writeContract({
            address: intent.exec.poolAddress,
            abi: POOL_TRANSFER_ABI,
            functionName: "transfer",
            args: transferCallArgs(intent),
          }),
    // Store this before the sweep is sent; its secret is now the seller's money.
    beforeSubmit: (fresh) => console.log(`  seller keeps fresh note ${fresh.commitment.slice(0, 12)}… (store its secret)`),
  });
  console.log(`\nSeller settle: ${settled.status}${settled.reason ? ` (${settled.reason})` : ""}`);
  if (!settled.grantAccess) throw new Error("Payment is not final. Do not serve.");
  console.log(`  swept in ${settled.sweep?.hash}; the buyer can no longer spend it back`);
  console.log("\nAccess granted. The public feed shows shielded transfers, never the amount or the parties.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
