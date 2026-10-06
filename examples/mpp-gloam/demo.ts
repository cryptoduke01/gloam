/**
 * A paid API over MPP, paid privately with the "gloam" method, end to end.
 *
 *   pnpm --filter gloam-mpp-example start                  (stub proofs, a second or two)
 *   pnpm --filter gloam-mpp-example start -- --real-proofs (real Groth16 transfer proofs, verified)
 *
 * A real HTTP server on localhost (Hono + mppx) charges 0.01 PathUSD per
 * request. An agent (mppx client) pays it twice from its private balance: once
 * in push mode (it broadcasts its own transfer) and once in pull mode (the
 * server submits it). The chain is a mock pool in memory that applies the
 * pool's transfer rules. Nothing is broadcast to any network.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { generateReceiveKey, packGroth16Proof, type NoteExport, type Prover } from "@gloamtrade/sdk";
import { isGloamChargeChallenge, parsePaymentChallenges, parseReceipt } from "@gloamtrade/mppx-gloam/core";
import { createMockPool } from "./mock-pool.js";
import { createPaidApi, listen } from "./server.js";
import { createAgent, createAgentWallet } from "./client.js";

const short = (s: string, n = 10) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s);
const usd = (base: bigint) => `${(Number(base) / 1e6).toFixed(2)} PathUSD`;
const step = (title: string) => console.log(`\n── ${title}`);

// ── proving ────────────────────────────────────────────────────────────────
const realProofs = process.argv.includes("--real-proofs");
let proofs = 0;
async function makeProver(): Promise<Prover> {
  if (!realProofs) {
    return async () => {
      proofs++;
      return { proofBytes: "0xdeadbeef" };
    };
  }
  const circuits = fileURLToPath(new URL("../../app/public/circuits/", import.meta.url));
  const vkeyPath = fileURLToPath(new URL("../../contracts/circuits/build/transfer_v2/transfer_vkey.json", import.meta.url));
  const wasm = `${circuits}transfer.wasm`;
  const zkey = `${circuits}transfer_final.zkey`;
  for (const f of [wasm, zkey, vkeyPath]) if (!existsSync(f)) throw new Error(`--real-proofs needs ${f}`);
  const snarkjs = await import("snarkjs");
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf8"));
  return async (input) => {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasm, zkey);
    if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) throw new Error("A transfer proof did not verify.");
    proofs++;
    return { proofBytes: packGroth16Proof(proof), publicSignals };
  };
}

// ── setup ──────────────────────────────────────────────────────────────────
const prove = await makeProver();
const pool = createMockPool();
const seller = await generateReceiveKey();
const sellerNotes: NoteExport[] = [];
const app = createPaidApi({
  receiveKey: seller,
  chain: pool.chain,
  submit: pool.submitter("seller"),
  prove,
  secretKey: process.env.MPP_SECRET_KEY ?? randomBytes(32).toString("base64"),
  onFreshNote: (n) => sellerNotes.push(n),
});
const server = await listen(app.fetch);
const url = `${server.url}/answer`;

// Record what the agent sends, to show it and to try a replay at the end.
const sent: { authorization: string | null }[] = [];
const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  sent.push({ authorization: new Headers(init?.headers).get("authorization") });
  return fetch(input, init);
}) as typeof fetch;

const wallet = createAgentWallet(pool);
wallet.add(await pool.shield(BigInt(`0x${randomBytes(30).toString("hex")}`), 5_000_000n));

console.log("Gloam private payments over MPP (mock pool, nothing broadcast)");
console.log(`  seller API      ${url}`);
console.log(`  seller tag      ${short(seller.tag, 18)}`);
console.log(`  agent balance   ${usd(wallet.balance())} in ${wallet.count()} shielded note`);
console.log(`  proofs          ${realProofs ? "real Groth16 transfer proofs, each verified" : "stubbed (run with --real-proofs for real ones)"}`);

// ── 1. the 402 ─────────────────────────────────────────────────────────────
step("1. GET /answer without paying");
const first = await fetch(url);
const [challenge] = parsePaymentChallenges(first.headers.get("www-authenticate")).filter(isGloamChargeChallenge);
if (!challenge) throw new Error("No gloam challenge in the 402.");
const req = challenge.request as { amount: string; currency: string; recipient: string; methodDetails: { chainId: number; pool: string } };
console.log(`  ${first.status} ${first.statusText}  WWW-Authenticate: Payment method="${challenge.method}", intent="${challenge.intent}"`);
console.log(`  price           ${usd(BigInt(req.amount))} (${req.amount} base units of ${short(req.currency)})`);
console.log(`  pay to          ${short(req.recipient, 18)} (the seller's receive tag)`);
console.log(`  settles in      pool ${short(req.methodDetails.pool)} on chain ${req.methodDetails.chainId}`);
console.log(`  expires         ${challenge.expires}`);

// ── 2 and 3. pay twice ─────────────────────────────────────────────────────
for (const mode of ["push", "pull"] as const) {
  step(`${mode === "push" ? "2" : "3"}. The agent pays in ${mode} mode`);
  const agent = createAgent({ pool, wallet, prove, mode, fetch: recordingFetch });
  const before = pool.publicFeed.length;
  const res = await agent.fetch(url);
  await wallet.settle();
  const receipt = parseReceipt(res.headers.get("payment-receipt") ?? "");
  console.log(`  ${res.status}  ${JSON.stringify(await res.json())}`);
  console.log(`  Payment-Receipt  method=${receipt.method} reference=${short(receipt.reference)} (the seller's sweep)`);
  const txs = pool.publicFeed.slice(before);
  for (const t of txs) console.log(`  on chain        Transferred by ${t.submittedBy.padEnd(6)} tx ${short(t.tx)}`);
  console.log(
    mode === "push"
      ? "  The agent broadcast its own transfer; the seller swept it before serving."
      : "  The agent broadcast nothing: the seller submitted the agent's proven transfer, then swept it."
  );
  console.log(`  agent balance   ${usd(wallet.balance())}`);
}

// ── 4. replay ──────────────────────────────────────────────────────────────
step("4. The same credential, presented again");
const used = sent.map((s) => s.authorization).filter(Boolean).at(-1)!;
const replay = await fetch(url, { headers: { authorization: used } });
const problem = (await replay.json()) as { type: string; detail: string };
console.log(`  ${replay.status}  ${problem.type.split("/").pop()}: ${problem.detail}`);

// ── 5. what everyone saw ───────────────────────────────────────────────────
step("5. What the public chain saw");
for (const t of pool.publicFeed) {
  console.log(`  Transferred  nullifier ${short(t.nullifier)}  commitments ${short(t.newCommitments[0])}, ${short(t.newCommitments[1])}`);
}
console.log("  Shielded transfers only: no amounts, no receive tags, no notes. What stays public is who submitted");
console.log("  each transaction (the agent's wallet in push mode, unless it pays through the Gloam relay; only the");
console.log("  seller in pull mode), and a sweep right after a payment can be linked to it by timing.");
const sellerTotal = sellerNotes.reduce((s, n) => s + BigInt(n.amountWei), 0n);
console.log(`\n  seller holds    ${usd(sellerTotal)} in ${sellerNotes.length} fresh notes only it knows`);
console.log(`  agent holds     ${usd(wallet.balance())} in ${wallet.count()} note`);
console.log(`  proofs          ${proofs}${realProofs ? " generated and verified" : " (stubbed)"}`);

await server.close();
if (realProofs) (globalThis as { curve_bn128?: { terminate?: () => void } }).curve_bn128?.terminate?.();
process.exit(0);
