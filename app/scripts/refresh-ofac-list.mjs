/**
 * Refresh the vendored OFAC sanctioned-address snapshot used for screening.
 *
 * Source: github.com/0xB10C/ofac-sanctioned-digital-currency-addresses, branch
 * `lists`, rebuilt nightly from the OFAC SDN list. We take every EVM-format
 * address (0x + 40 hex) from the lists that can hold one, lowercase, dedupe,
 * sort, and record which commit of the source they came from.
 *
 * Run from app/:  node scripts/refresh-ofac-list.mjs
 * Then review the diff of src/lib/screeningList.json and commit it.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REPO = "0xB10C/ofac-sanctioned-digital-currency-addresses";
const BRANCH = "lists";
// OFAC tags addresses by currency; these are the ones that can be 0x addresses.
const LISTS = ["ETH", "USDT", "USDC", "ARB", "BSC", "ETC"];
const OUT = fileURLToPath(new URL("../src/lib/screeningList.json", import.meta.url));
const EVM = /^0x[0-9a-fA-F]{40}$/;

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "gloam-ofac-refresh" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const commit = (await getJson(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`)) ?? {};
const sha = commit.sha;
if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("Could not read the source commit.");

const counts = {};
const all = new Set();
for (const tag of LISTS) {
  const file = `sanctioned_addresses_${tag}.json`;
  const list = await getJson(`https://raw.githubusercontent.com/${REPO}/${sha}/${file}`);
  if (!Array.isArray(list)) throw new Error(`${file} is not a list.`);
  const evm = list.filter((a) => typeof a === "string" && EVM.test(a));
  counts[file] = evm.length;
  for (const a of evm) all.add(a.toLowerCase());
}
// The ETH list alone has held 100+ entries for years; a tiny result means a broken fetch.
if (all.size < 50) throw new Error(`Only ${all.size} addresses: refusing to write a suspicious list.`);

const snapshot = {
  name: "OFAC SDN sanctioned digital currency addresses (EVM)",
  source: `https://github.com/${REPO}/tree/${BRANCH}`,
  sourceCommit: sha,
  sourceUpdatedAt: commit.commit?.committer?.date ?? null,
  snapshotDate: new Date().toISOString().slice(0, 10),
  lists: counts,
  count: all.size,
  addresses: [...all].sort(),
};
await writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Wrote ${all.size} addresses from ${REPO}@${sha.slice(0, 7)} to src/lib/screeningList.json`);
