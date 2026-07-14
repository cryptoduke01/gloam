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
const pack = {
  v: 1,
  t: "gloam-private-note",
  s: "poseidon",
  p: "0xA488809a089F003A2B6E69daa65B0db79823c93B",
  a: "0x0000000000000000000000000000000000000000",
  w: "1000000000000000",
  k: "0x" + "11".repeat(32),
  c: "0x" + "22".repeat(32),
};

const encoded = PREFIX + b64urlEncode(Buffer.from(JSON.stringify(pack), "utf8"));
if (!encoded.startsWith(PREFIX)) throw new Error("prefix");
const decoded = JSON.parse(b64urlDecode(encoded.slice(PREFIX.length)).toString("utf8"));
if (decoded.k !== pack.k || decoded.w !== pack.w) throw new Error("roundtrip");

console.log("smoke-note-package: ok");
console.log("sample length", encoded.length);
