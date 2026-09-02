/**
 * Fetch the shield circuit artifacts into public/circuits so the browser can
 * prove locally. Runs before dev/build. Skips files already present, or the
 * whole step if NEXT_PUBLIC_GLOAM_ARTIFACTS points at a remote http(s) URL
 * (then the browser fetches them from there instead).
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const remote = process.env.NEXT_PUBLIC_GLOAM_ARTIFACTS;
if (remote && /^https?:\/\//.test(remote)) {
  console.log(`Using remote artifacts at ${remote}; skipping local download.`);
  process.exit(0);
}

const SOURCE = process.env.GLOAM_ARTIFACTS_SOURCE || "https://www.gloam.trade/circuits";
const FILES = ["shield.wasm", "shield_final.zkey"];
const OUT = "public/circuits";
mkdirSync(OUT, { recursive: true });

let ok = true;
for (const f of FILES) {
  const dest = join(OUT, f);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`  ✓ ${f} (present)`);
    continue;
  }
  try {
    process.stdout.write(`  ↓ ${f} … `);
    const res = await fetch(`${SOURCE}/${f}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
  } catch (e) {
    ok = false;
    console.log(`failed (${e.message})`);
  }
}

if (!ok) {
  console.error(`\nCould not fetch some artifacts from ${SOURCE}.`);
  console.error(`Set GLOAM_ARTIFACTS_SOURCE to a reachable base, or copy`);
  console.error(`shield.wasm + shield_final.zkey into ${OUT}/ manually.\n`);
  process.exit(1);
}
