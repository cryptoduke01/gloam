import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_SEPOLIA_USDC, IncrementalMerkleTreePoseidon, hexToField, makeBoundNotePoseidon } from "@gloamtrade/sdk";
import type { PublicClient } from "viem";
import { Artifacts, PINNED_PROOF_SHA256, shutdownProver, verificationKey } from "../src/artifacts.ts";

after(() => shutdownProver());
import { decodeProof, encodeProof, proveFunds, verifyHolderProof } from "../src/proofs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CIRCUITS = join(here, "..", "..", "..", "app", "public", "circuits");
const POOL = "0x39e28cde55cab798874746ac52cb4b5cc99a0194" as const;

test("the checking keys in this package are the ones the app pins", () => {
  for (const circuit of ["funds", "receipt"] as const) {
    for (const [ceremony, dir] of [["dev", ""], ["production", "final/"]] as const) {
      const app = readFileSync(join(CIRCUITS, `${dir}${circuit}_vkey.json`));
      assert.equal(createHash("sha256").update(app).digest("hex"), PINNED_PROOF_SHA256[circuit].vkey[ceremony]);
      assert.ok(verificationKey(circuit, ceremony));
    }
  }
});

/** A chain that says yes to the vault reads a fresh proof needs. */
const yesChain = (spent = false) =>
  ({
    readContract: async ({ functionName }: { functionName: string }) => (functionName === "isSpent" ? spent : true),
  }) as unknown as PublicClient;

test("a proof of funds made here checks out, and any edit to it does not", async () => {
  const amounts = [3_000_000n, 4_500_000n];
  const notes = await Promise.all(amounts.map((a) => makeBoundNotePoseidon(a, BASE_SEPOLIA_USDC)));
  const tree = new IncrementalMerkleTreePoseidon();
  await tree.init();
  for (const n of notes) await tree.insert(hexToField(n.commitment));
  const paths = await Promise.all([tree.path(0), tree.path(1)]);
  const proof = await proveFunds({
    artifacts: new Artifacts({ dir: CIRCUITS, url: "http://127.0.0.1:1/unused" }),
    chainId: 84532,
    pool: POOL,
    asset: BASE_SEPOLIA_USDC,
    threshold: 7_000_000n,
    notes: notes.map((n, i) => ({ secret: n.secret, amount: amounts[i]!, path: paths[i]! })),
    verifier: "  Acme​ desk  ",
  });
  assert.equal(proof.verifier, "Acme desk", "the label is cleaned before it is sealed in");
  const text = encodeProof(proof);
  assert.ok(text.startsWith("gloamfunds1:"));
  // The app's encoding: base64 of the UTF-8 JSON.
  assert.equal(text, `gloamfunds1:${btoa(JSON.stringify(proof))}`);
  const back = decodeProof(text);
  assert.equal(back.kind, "funds");
  if (back.kind !== "funds") return;
  const good = await verifyHolderProof(back, yesChain());
  assert.equal(good.ok, true, JSON.stringify(good.checks));
  assert.equal(good.checks.length, 8);
  for (const s of notes) assert.ok(!text.includes(s.secret.slice(2)), "the proof carries no note secret");

  const relabeled = await verifyHolderProof({ ...back, verifier: "Someone else" }, yesChain());
  assert.equal(relabeled.ok, false);
  assert.equal(relabeled.checks.find((c) => c.label.startsWith("Made for"))?.state, "fail");
  const raised = await verifyHolderProof({ ...back, threshold: "9000000" }, yesChain());
  assert.equal(raised.checks.find((c) => c.label === "Asset and amount match the proof")?.state, "fail");
  const forged = await verifyHolderProof({ ...back, publicSignals: back.publicSignals.map((s, i) => (i === 2 ? "9000000" : s)) }, yesChain());
  assert.equal(forged.checks[0]!.state, "fail");
  const otherVault = await verifyHolderProof({ ...back, pool: "0x0000000000000000000000000000000000000001" }, yesChain());
  assert.equal(otherVault.ok, false);
  const moved = await verifyHolderProof(back, yesChain(true));
  assert.equal(moved.ok, false);
  assert.equal(moved.checks.find((c) => c.label === "Balance is still unspent")?.state, "fail");
  const expired = await verifyHolderProof({ ...back, expiresAt: 1 }, yesChain());
  assert.equal(expired.ok, false);
});

test("proofs this plugin does not check are named, not mistaken", () => {
  assert.throws(() => decodeProof("gloamroll1:e30="), /gloam.trade\/verify/);
  assert.throws(() => decodeProof("hello"), /Not a Gloam proof/);
  assert.throws(() => decodeProof("gloamfunds1:bm90IGpzb24="), /damaged/);
});
