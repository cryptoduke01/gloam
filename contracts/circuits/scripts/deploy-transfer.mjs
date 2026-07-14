#!/usr/bin/env node
/**
 * Deploy TransferVerifier + TransferIVerifier + DualProofVerifier,
 * then setVerifier on the Poseidon pool (owner only).
 *
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   # defaults from poseidon-testnet.json if present
 *   export POOL=0xA488...
 *   export UNSHIELD_I_VERIFIER=0xa40e...
 *   node scripts/deploy-transfer.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

const RPC = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const pkRaw = process.env.DEPLOYER_PK;
if (!pkRaw) {
  console.error("Set DEPLOYER_PK");
  process.exit(1);
}
const pkHex = pkRaw.trim().replace(/^0x/i, "");
if (pkHex.length !== 64) {
  console.error(`DEPLOYER_PK must be 64 hex chars (got ${pkHex.length})`);
  process.exit(1);
}
const pk = `0x${pkHex}`;

function loadEthers() {
  const ethers = require("ethers");
  return ethers.ethers ?? ethers;
}

async function main() {
  const ethers = loadEthers();
  const v6 = typeof ethers.JsonRpcProvider === "function";
  const provider = v6
    ? new ethers.JsonRpcProvider(RPC)
    : new ethers.providers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);
  console.log("deployer", wallet.address);

  let pool = process.env.POOL;
  let unshieldI = process.env.UNSHIELD_I_VERIFIER;
  const depPath = join(root, "deployments/poseidon-testnet.json");
  if (existsSync(depPath)) {
    const dep = JSON.parse(readFileSync(depPath, "utf8"));
    pool = pool || dep.contracts.ShieldPoolPoseidon;
    unshieldI = unshieldI || dep.contracts.UnshieldIVerifier;
  }
  if (!pool || !unshieldI) {
    console.error("Set POOL and UNSHIELD_I_VERIFIER (or poseidon-testnet.json)");
    process.exit(1);
  }

  function loadArtifact(name) {
    const candidates = [
      join(root, "out", `${name}.sol`, `${name}.json`),
      join(root, "out", name, `${name}.json`),
    ];
    const p = candidates.find((c) => existsSync(c));
    if (!p) throw new Error(`Missing artifact ${name} — forge build`);
    return JSON.parse(readFileSync(p, "utf8"));
  }

  async function waitDeployed(c) {
    if (v6) {
      await c.waitForDeployment();
      return await c.getAddress();
    }
    await c.deployed();
    return c.address;
  }

  async function deploy(name, args = []) {
    const art = loadArtifact(name);
    const bytecode =
      typeof art.bytecode === "string" ? art.bytecode : art.bytecode.object;
    const factory = new ethers.ContractFactory(art.abi, bytecode, wallet);
    console.log("deploying", name, args);
    const c = await factory.deploy(...args);
    const addr = await waitDeployed(c);
    console.log(name, addr);
    return addr;
  }

  const transferVerifier = await deploy("TransferVerifier");
  const transferI = await deploy("TransferIVerifier", [transferVerifier]);
  const dual = await deploy("DualProofVerifier", [unshieldI, transferI]);

  // setVerifier on pool
  const poolArt = loadArtifact("ShieldPoolPoseidon");
  const poolC = new ethers.Contract(pool, poolArt.abi, wallet);
  console.log("setVerifier", dual, "on", pool);
  const tx = await poolC.setVerifier(dual);
  await tx.wait();
  console.log("setVerifier tx", tx.hash);

  // update deployment json
  const dep = existsSync(depPath)
    ? JSON.parse(readFileSync(depPath, "utf8"))
    : { contracts: {} };
  dep.contracts.TransferVerifier = transferVerifier;
  dep.contracts.TransferIVerifier = transferI;
  dep.contracts.DualProofVerifier = dual;
  dep.contracts.ShieldPoolPoseidon = pool;
  dep.privateSend = true;
  dep.updatedAt = new Date().toISOString();
  writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("updated", depPath);
  console.log(JSON.stringify(dep.contracts, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
