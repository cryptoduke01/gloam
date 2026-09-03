/**
 * Reference wrapper — an autonomous agent that shields ETH PRIVATELY on Gloam,
 * using only @gloamtrade/sdk for the private path. It mints a note, generates the
 * zero-knowledge shield proof, and deposits via shieldBound() on the hardened
 * Robinhood Chain testnet pool. This is the smallest end-to-end example of an
 * app or agent plugging into Gloam's private layer.
 *
 *   GLOAM_AGENT_PRIVATE_KEY=0x<funded RH testnet key> \
 *     npx tsx examples/agent-shield/agent-shield.ts
 *
 * Needs: a funded testnet key, snarkjs installed, and the shield circuit
 * artifacts (shield.wasm + shield_final.zkey) — reused here from the app's
 * public dir. Persist note.secret from the output to spend the balance later.
 */
import {
  createWalletClient,
  createPublicClient,
  defineChain,
  http,
  parseEther,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildShieldBoundIntent,
  artifactProver,
  RH_TESTNET_CHAIN_ID,
} from "@gloamtrade/sdk";

const RPC = "https://rpc.testnet.chain.robinhood.com";
const here = dirname(fileURLToPath(import.meta.url));
// Reuse the shield artifacts shipped with the app (dev ceremony keys).
const WASM = resolve(here, "../../app/public/circuits/shield.wasm");
const ZKEY = resolve(here, "../../app/public/circuits/shield_final.zkey");

const rhTestnet = defineChain({
  id: RH_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
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

async function main() {
  const pk = process.env.GLOAM_AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("Set GLOAM_AGENT_PRIVATE_KEY (a funded RH testnet key).");
  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`
  );
  const wallet = createWalletClient({ account, chain: rhTestnet, transport: http(RPC) });
  const pub = createPublicClient({ chain: rhTestnet, transport: http(RPC) });

  const amountWei = parseEther("0.001");
  console.log(`Agent ${account.address} shielding ${formatEther(amountWei)} ETH…`);

  // 1) Build the hardened shield intent. The SDK mints a Poseidon note and runs
  //    the shield prover to bind the commitment to (amount, asset).
  const intent = await buildShieldBoundIntent({
    amountWei,
    prover: artifactProver({ wasm: WASM, zkey: ZKEY }),
  });

  console.log("Minted note. PERSIST THIS SECRET to spend later:");
  console.log("  secret:    ", intent.note.secret);
  console.log("  commitment:", intent.note.commitment);
  console.log("  pool:      ", intent.exec.poolAddress);

  // 2) Sign + broadcast the resolved on-chain call the SDK gave us.
  const hash = await wallet.writeContract({
    address: intent.exec.poolAddress,
    abi: shieldBoundAbi,
    functionName: "shieldBound",
    args: intent.exec.args as readonly [
      `0x${string}`,
      bigint,
      `0x${string}`,
      `0x${string}`,
    ],
    value: intent.exec.valueWei,
  });
  console.log("Submitted:", hash);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(
    receipt.status === "success"
      ? "Shielded privately. The balance is now off the public feed."
      : "Reverted — check the pool has a shieldVerifier set and the key is funded."
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
