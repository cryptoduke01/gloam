/**
 * x402 edge cases: exact (zero-change) payment, native-asset payment, malformed
 * disclosure rejection, and disclosure survival through the header transport.
 * All local, stub prover, in-memory tree.
 *
 * Run after build:  node test/x402.edge.selftest.mjs
 */
import {
  IncrementalMerkleTreePoseidon,
  noteCommitmentPoseidon,
  fieldToHex,
  buildGloamPaymentRequirements,
  buildGloamPayment,
  verifyGloamPayment,
  decodePaymentHeader,
  NATIVE_ASSET,
} from "../dist/index.js";

let checks = 0;
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } checks++; };
const prove = async () => ({ proofBytes: "0xdeadbeef" });

async function pathFor(secret, amount, asset) {
  const tree = new IncrementalMerkleTreePoseidon();
  await tree.insert(await noteCommitmentPoseidon(secret, amount, asset));
  await tree.insert(await noteCommitmentPoseidon(9n, 1n, asset));
  return tree.path(0);
}

// 1) Exact payment: note amount == price, change note is zero, still valid.
{
  const STABLE = "0x00000000000000000000000000000000000000ee";
  const S = 7n, AMT = 250_000_000_000_000n;
  const req = buildGloamPaymentRequirements({ amountWei: AMT, asset: STABLE, assetSymbol: "USD", payTo: "p", resource: "r" });
  const built = await buildGloamPayment({ requirements: req, senderSecretHex: fieldToHex(S), senderNoteAmountWei: AMT, path: await pathFor(S, AMT, STABLE), prove });
  assert(built.changeNote.amountWei === "0", "exact payment: change note is zero");
  assert(verifyGloamPayment({ requirements: req, payload: built.payload }).ok === true, "exact payment verifies");
}

// 2) Native-asset payment (asset omitted -> NATIVE_ASSET) builds and verifies.
{
  const S = 11n, IN = 1_000_000_000_000_000n, PAY = 400_000_000_000_000n;
  const req = buildGloamPaymentRequirements({ amountWei: PAY, assetSymbol: "ETH", payTo: "p", resource: "r" });
  assert(req.asset.toLowerCase() === NATIVE_ASSET.toLowerCase(), "native requirement asset defaults to NATIVE_ASSET");
  const built = await buildGloamPayment({ requirements: req, senderSecretHex: fieldToHex(S), senderNoteAmountWei: IN, path: await pathFor(S, IN, NATIVE_ASSET), prove });
  const v = verifyGloamPayment({ requirements: req, payload: built.payload });
  assert(v.ok === true, `native payment verifies (${v.reason})`);
  assert(v.asset.toLowerCase() === NATIVE_ASSET.toLowerCase(), "native payment verify surfaces native asset");
}

// 3) Malformed disclosure is rejected by verify.
{
  const STABLE = "0x00000000000000000000000000000000000000ee";
  const S = 13n, AMT = 250_000_000_000_000n, IN = 1_000_000_000_000_000n;
  const req = buildGloamPaymentRequirements({ amountWei: AMT, asset: STABLE, assetSymbol: "USD", payTo: "p", resource: "r" });
  const built = await buildGloamPayment({ requirements: req, senderSecretHex: fieldToHex(S), senderNoteAmountWei: IN, path: await pathFor(S, IN, STABLE), prove, issuerTag: "issuer:x" });
  // tamper: strip required fields from the disclosure
  built.payload.payload.disclosure = { v: 1, scope: "issuer" };
  const v = verifyGloamPayment({ requirements: req, payload: built.payload });
  assert(v.ok === false && /disclosure/.test(v.reason), "malformed disclosure rejected");
}

// 4) Disclosure survives the X-PAYMENT header round-trip.
{
  const STABLE = "0x00000000000000000000000000000000000000ee";
  const S = 17n, AMT = 250_000_000_000_000n, IN = 1_000_000_000_000_000n;
  const req = buildGloamPaymentRequirements({ amountWei: AMT, asset: STABLE, assetSymbol: "USD", payTo: "p", resource: "r" });
  const built = await buildGloamPayment({ requirements: req, senderSecretHex: fieldToHex(S), senderNoteAmountWei: IN, path: await pathFor(S, IN, STABLE), prove, issuerTag: "issuer:x" });
  const decoded = decodePaymentHeader(built.header);
  assert(decoded.payload.disclosure && decoded.payload.disclosure.issuerTag === "issuer:x", "disclosure survives header round-trip");
  assert(decoded.payload.disclosure.commitment === built.paymentNote.commitment, "round-tripped disclosure still binds the note");
}

console.log(`x402.edge.selftest: ok (${checks} assertions)`);
