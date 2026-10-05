#!/usr/bin/env node
/**
 * Build the proof-of-funds (solvency) and proof-of-payment (receipt) circuits:
 *   circom compile -> groth16 setup on pot16 -> one dev contribution -> vkey,
 * then copy the browser artifacts into app/public/circuits:
 *   funds.wasm, funds_final.zkey, funds_vkey.json
 *   receipt.wasm, receipt_final.zkey, receipt_vkey.json
 *
 * DEV KEYS: a single-party phase-2 contribution with throwaway entropy, same as
 * the other Gloam circuits on testnet. Not a production ceremony. Every run makes
 * NEW keys, so proofs made with the previous keys stop verifying.
 *
 *   cd contracts/circuits
 *   node scripts/build-proof-circuits.mjs            # both
 *   node scripts/build-proof-circuits.mjs receipt    # one
 *   node scripts/build-proof-circuits.mjs --no-copy  # keep app/public untouched
 */
import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const circuitsDir = join(__dirname, "..");
const appCircuits = join(circuitsDir, "../../app/public/circuits");
const PTAU = join(circuitsDir, "build/ceremony/pot16_final.ptau");
const SNARKJS = join(circuitsDir, "node_modules/.bin/snarkjs");
const CIRCOM = existsSync(join(homedir(), ".cargo/bin/circom"))
  ? join(homedir(), ".cargo/bin/circom")
  : "circom";

// name = circuit dir + .circom basename; app = artifact prefix the browser loads.
const CIRCUITS = [
  { name: "solvency", app: "funds" },
  { name: "receipt", app: "receipt" },
];

const args = process.argv.slice(2);
const copy = !args.includes("--no-copy");
const only = args.filter((a) => !a.startsWith("--"));
const targets = only.length ? CIRCUITS.filter((c) => only.includes(c.name)) : CIRCUITS;
if (!targets.length) {
  console.error(`Unknown circuit. Pick from: ${CIRCUITS.map((c) => c.name).join(", ")}`);
  process.exit(1);
}
if (!existsSync(PTAU)) {
  console.error(`Missing ${PTAU} (Powers of Tau 2^16).`);
  process.exit(1);
}

function run(cmd, argv) {
  execFileSync(cmd, argv, { cwd: circuitsDir, stdio: ["ignore", "inherit", "inherit"] });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

for (const c of targets) {
  const out = join(circuitsDir, "build", c.name);
  mkdirSync(out, { recursive: true });
  const r1cs = join(out, `${c.name}.r1cs`);
  const zkey0 = join(out, `${c.name}_0.zkey`);
  const zkey = join(out, `${c.name}_final.zkey`);
  const vkey = join(out, `${c.name}_vkey.json`);
  const wasm = join(out, `${c.name}_js`, `${c.name}.wasm`);

  console.log(`\n== ${c.name}: compile`);
  run(CIRCOM, [`${c.name}/${c.name}.circom`, "--r1cs", "--wasm", "--sym", "-o", out, "-l", "node_modules"]);

  console.log(`== ${c.name}: groth16 setup (pot16)`);
  run(SNARKJS, ["groth16", "setup", r1cs, PTAU, zkey0]);

  console.log(`== ${c.name}: dev contribution`);
  run(SNARKJS, [
    "zkey", "contribute", zkey0, zkey,
    `--name=gloam-dev-${c.name}`,
    `-e=${randomBytes(32).toString("hex")}`,
  ]);

  console.log(`== ${c.name}: export verification key`);
  run(SNARKJS, ["zkey", "export", "verificationkey", zkey, vkey]);

  if (copy) {
    mkdirSync(appCircuits, { recursive: true });
    const files = [
      [wasm, `${c.app}.wasm`],
      [zkey, `${c.app}_final.zkey`],
      [vkey, `${c.app}_vkey.json`],
    ];
    for (const [from, to] of files) {
      const dest = join(appCircuits, to);
      copyFileSync(from, dest);
      console.log(`   ${to}  ${statSync(dest).size} bytes  sha256 ${sha256(dest)}`);
    }
  }
}

if (copy) {
  console.log(
    "\nUpdate the sha256 pins in app/src/lib/proofs/artifacts.ts to the values above."
  );
}
