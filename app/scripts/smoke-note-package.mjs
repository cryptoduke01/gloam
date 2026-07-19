/**
 * Quick smoke for compact payment packages (no crypto / no DOM).
 * Run: node scripts/smoke-note-package.mjs
 */

function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

const PREFIX = "gloam1.";
// Use short placeholder secrets (not 32-byte hex — avoids secret-scanner FPs)
const pack = {
  v: 1,
  t: "gloam-private-note",
  s: "poseidon",
  p: "0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F",
  a: "0x0000000000000000000000000000000000000000",
  w: "1000000000000000",
  k: "test-secret-not-a-key",
  c: "test-commitment-not-a-key",
};

const encoded = PREFIX + b64urlEncode(Buffer.from(JSON.stringify(pack), "utf8"));
if (!encoded.startsWith(PREFIX)) throw new Error("prefix");
const decoded = JSON.parse(b64urlDecode(encoded.slice(PREFIX.length)).toString("utf8"));
if (decoded.k !== pack.k || decoded.w !== pack.w) throw new Error("roundtrip");

console.log("smoke-note-package: ok");
console.log("sample length", encoded.length);
