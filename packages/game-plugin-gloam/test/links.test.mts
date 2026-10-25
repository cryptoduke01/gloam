import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeNotePackage, fieldToHex, makeBoundNotePoseidon, BASE_SEPOLIA_USDC } from "@gloamtrade/sdk";
// The app's own claim-link code, to prove the links are the same character for character.
import * as app from "../../../app/src/lib/claimLink.ts";
import { claimLinkFor, codeFromLinkText, readClaimLink, looksLikeClaimCode } from "../src/claimLinks.ts";
import { REDACTED, holdsSecret, redact, registerSecret } from "../src/redact.ts";

const POOL = "0x39e28cde55cab798874746ac52cb4b5cc99a0194" as const;

async function sampleCode(note?: string) {
  const n = await makeBoundNotePoseidon(2_500_000n, BASE_SEPOLIA_USDC);
  return {
    note: n,
    code: encodeNotePackage({ pool: POOL, asset: BASE_SEPOLIA_USDC, amountWei: "2500000", secret: n.secret, commitment: n.commitment, note }),
  };
}

test("claim links match the Gloam app's, and read back", async () => {
  for (const memo of [undefined, "payout job 440", "inv-2_a.b"]) {
    const { code, note } = await sampleCode(memo);
    for (const net of ["base", "robinhood-mainnet"]) {
      const ours = claimLinkFor(code, net);
      assert.equal(ours, app.claimLinkFor(code, net));
      // Only letters, digits and "=" after #claim=, so chat apps keep the link whole.
      assert.match(ours.split("#claim=")[1]!, /^[A-Za-z0-9=]+$/);
      const back = readClaimLink(ours);
      assert.equal(back.networkKey, net);
      assert.equal(back.pack.secret.toLowerCase(), note.secret.toLowerCase());
      assert.equal(back.pack.amountWei, "2500000");
      assert.equal(back.pack.note, memo);
      assert.equal(codeFromLinkText(ours.split("#claim=")[1]!), app.codeFromLinkText(ours.split("#claim=")[1]!));
    }
    // A bare code works too, and older link forms still read.
    assert.equal(readClaimLink(code).pack.commitment.toLowerCase(), note.commitment.toLowerCase());
    assert.equal(readClaimLink(`https://www.gloam.trade/claim?net=base#claim=${code.replace(/^gloam1\./, "gloam1-")}`).pack.amountWei, "2500000");
  }
  assert.throws(() => readClaimLink("https://www.gloam.trade/claim?net=base"), /no claim code/);
  assert.throws(() => readClaimLink("gloam1e.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), /passphrase/);
  assert.throws(() => readClaimLink("hello"), /not a Gloam claim link/);
});

test("redact removes registered secrets and claim codes, and leaves tx hashes alone", async () => {
  const { code, note } = await sampleCode("x");
  registerSecret(note.secret);
  const txHash = fieldToHex(123456789n);
  const link = claimLinkFor(code, "base");
  const text = JSON.stringify({ hash: txHash, secret: note.secret, upper: note.secret.toUpperCase().replace("0X", "0x"), link, code });
  const out = redact(text);
  assert.ok(out.includes(txHash), "a tx hash stays");
  assert.ok(!out.toLowerCase().includes(note.secret.toLowerCase().slice(2)), "the secret goes");
  assert.ok(!out.includes(code.slice(7, 30)), "the claim code goes");
  assert.ok(out.includes(REDACTED));
  assert.equal(holdsSecret(text), true);
  assert.equal(holdsSecret(JSON.stringify({ hash: txHash })), false);
  assert.equal(looksLikeClaimCode("gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE"), false, "a Gloam address is not a secret");
  assert.equal(looksLikeClaimCode("gloamfunds1:eyJ2IjoxfQ=="), false, "a proof is not a secret");
});
