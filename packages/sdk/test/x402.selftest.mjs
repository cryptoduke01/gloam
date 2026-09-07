/**
 * x402 private-payment self-test.
 *
 * Drives the full agent-payment rail locally, offline, with a stub prover and an
 * in-memory tree: a server prices a resource (402 requirements), an agent builds
 * a private payment of the required amount to the payee, and the server verifies
 * the payment binds the required amount + asset and settles through the right
 * pool. Also checks the issuer-scoped compliance disclosure shape and the
 * explicit Gloam-vs-Zone posture. No chain, no broadcast.
 *
 * Run after build:  node test/x402.selftest.mjs
 */
import {
  IncrementalMerkleTreePoseidon,
  noteCommitmentPoseidon,
  fieldToHex,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  verifyGloamPayment,
  buildComplianceDisclosure,
  isComplianceDisclosureShape,
  decodePaymentHeader,
  decodePaymentNote,
  encodeRequirements,
  decodeRequirements,
  GLOAM_X402_SCHEME,
  GLOAM_VS_ZONE,
  SEALED_VAULT,
} from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}

// A simple non-native testnet stable asset (non-freezing) for the rails proof.
const STABLE = "0x00000000000000000000000000000000000000ee";
const SECRET = 42424242424242424242n;
const NOTE_AMOUNT = 1_000_000_000_000_000n; // 0.001 in base units
const PRICE = 250_000_000_000_000n; // required by the resource
const NETWORK = 46630;
const STUB_PROOF = "0xdeadbeef";
const prove = async () => ({ proofBytes: STUB_PROOF });

// Fixture pool tree: the agent's note as leaf 0, two decoys.
const tree = new IncrementalMerkleTreePoseidon();
const leaf = await noteCommitmentPoseidon(SECRET, NOTE_AMOUNT, STABLE);
await tree.insert(leaf);
await tree.insert(await noteCommitmentPoseidon(111n, 5n, STABLE));
await tree.insert(await noteCommitmentPoseidon(222n, 7n, STABLE));
const path = await tree.path(0);
const senderSecretHex = fieldToHex(SECRET);

// ── server: price the resource ────────────────────────────────────────────────
const req = buildGloamPaymentRequirements({
  amountWei: PRICE,
  asset: STABLE,
  assetSymbol: "USD",
  payTo: "gloam:rcpt:demo-payee",
  resource: "mcp://gloam/tool/summarize",
  description: "Private payment for one summarize call",
  network: NETWORK,
});
assert(req.scheme === GLOAM_X402_SCHEME, "requirements scheme");
assert(req.maxAmountRequired === PRICE.toString(), "requirements amount");
assert(req.poolAddress === SEALED_VAULT, "requirements default pool");
assert(req.privacy.oneLine.includes("not an operator-visible Zone"), "requirements carry Gloam-vs-Zone");
// requirements survive a base64 transport round-trip
assert(decodeRequirements(encodeRequirements(req)).maxAmountRequired === PRICE.toString(), "requirements encode/decode");

// ── agent: build the private payment ──────────────────────────────────────────
const built = await buildGloamPayment({
  requirements: req,
  senderSecretHex,
  senderNoteAmountWei: NOTE_AMOUNT,
  path,
  prove,
  issuerTag: "issuer:testusd",
});
assert(built.payload.scheme === GLOAM_X402_SCHEME, "payload scheme");
assert(built.payload.network === NETWORK, "payload network");
assert(built.payload.payload.exec.fn === "transfer", "payload settles via transfer");
assert(built.payload.payload.exec.poolAddress === SEALED_VAULT, "payload pool");
assert(built.payload.payload.txHash === null, "payload txHash unset before broadcast");
assert(built.changeNote && BigInt(built.changeNote.amountWei) === NOTE_AMOUNT - PRICE, "change note = note - price");

const payNote = decodePaymentNote(built.payload.payload.paymentNote);
assert(BigInt(payNote.amountWei) === PRICE, "payment note carries the required amount");
assert(payNote.asset.toLowerCase() === STABLE.toLowerCase(), "payment note asset = stable");

// X-PAYMENT header round-trips
const roundTrip = decodePaymentHeader(built.header);
assert(roundTrip.payload.paymentNote === built.payload.payload.paymentNote, "header encode/decode");

// ── server: verify the payment ────────────────────────────────────────────────
const v = verifyGloamPayment({ requirements: req, payload: built.payload });
assert(v.ok === true, `verify ok (got: ${v.reason})`);
assert(v.amountWei === PRICE.toString(), "verify surfaces amount");
assert(v.commitment === payNote.commitment, "verify surfaces the commitment to check on-chain");
assert(v.onchainChecksRequired.length === 3, "verify lists 3 on-chain checks");
assert(v.onchainChecksRequired.some((c) => c.includes("not yet attached")), "verify flags missing settlement tx");

// after the agent broadcasts, it attaches the tx hash
built.payload.payload.txHash = "0xabc123";
const v2 = verifyGloamPayment({ requirements: req, payload: built.payload });
assert(v2.ok === true, "verify ok with tx hash");
assert(v2.onchainChecksRequired.some((c) => c.includes("0xabc123")), "verify references the settlement tx");

// ── compliance disclosure (issuer-scoped) ─────────────────────────────────────
assert(built.payload.payload.disclosure, "disclosure attached when issuerTag given");
assert(built.payload.payload.disclosure.stub === true, "disclosure is a stub without a proof");
assert(isComplianceDisclosureShape(built.payload.payload.disclosure), "disclosure shape valid");
assert(built.payload.payload.disclosure.commitment === payNote.commitment, "disclosure binds the payment note");
const injected = await buildComplianceDisclosure({ issuerTag: "issuer:testusd", note: payNote, proof: { pi_a: [] } });
assert(injected.stub === false, "injecting a proof leaves stub mode");
// generating via a shield prover produces a real (non-stub) disclosure carrying the proof
const proven = await buildComplianceDisclosure({ issuerTag: "issuer:testusd", note: payNote, prove: async () => ({ proofBytes: "0xfeed" }) });
assert(proven.stub === false && proven.proof === "0xfeed", "prover-generated disclosure is real");
// a payment built with a disclosureProver carries a real disclosure
const builtProven = await buildGloamPayment({
  requirements: req, senderSecretHex, senderNoteAmountWei: NOTE_AMOUNT, path, prove,
  issuerTag: "issuer:testusd", disclosureProver: async () => ({ proofBytes: "0xfeed" }),
});
assert(builtProven.payload.payload.disclosure.stub === false, "payment with disclosureProver carries a real disclosure");

// ── negative cases ────────────────────────────────────────────────────────────
// asset mismatch: a requirement for native ETH must reject a stable-asset note
const reqEth = buildGloamPaymentRequirements({ amountWei: PRICE, payTo: "x", resource: "r", network: NETWORK });
assert(verifyGloamPayment({ requirements: reqEth, payload: built.payload }).ok === false, "reject asset mismatch");
// amount too low: tamper the requirement upward
const reqHigh = { ...req, maxAmountRequired: (PRICE * 2n).toString() };
assert(verifyGloamPayment({ requirements: reqHigh, payload: built.payload }).ok === false, "reject underpayment");
// wrong pool
const reqPool = { ...req, poolAddress: "0x0000000000000000000000000000000000000001" };
assert(verifyGloamPayment({ requirements: reqPool, payload: built.payload }).ok === false, "reject wrong pool");
// scheme mismatch
const badScheme = { ...built.payload, scheme: "exact" };
assert(verifyGloamPayment({ requirements: req, payload: badScheme }).ok === false, "reject non-gloam scheme");
// underfunded sender note
let threw = false;
try {
  await buildGloamPayment({ requirements: { ...req, maxAmountRequired: (NOTE_AMOUNT * 2n).toString() }, senderSecretHex, senderNoteAmountWei: NOTE_AMOUNT, path, prove });
} catch {
  threw = true;
}
assert(threw, "reject building a payment the note cannot cover");

// ── Gloam vs Zone posture (explicit, not marketing-only) ──────────────────────
assert(GLOAM_VS_ZONE.gloam.some((s) => s.toLowerCase().includes("self-custodial") || s.toLowerCase().includes("settles its own")), "posture: self-custodial");
assert(GLOAM_VS_ZONE.zone.some((s) => s.toLowerCase().includes("operator sees")), "posture: zone operator sees all");

console.log(`x402.selftest: ok (${checks} assertions)`);
