#!/usr/bin/env node
/**
 * Deploy Phase-2 Poseidon stack to Robinhood testnet:
 *   Poseidon2, Poseidon3, UnshieldVerifier, UnshieldIVerifier, ShieldPoolPoseidon
 *
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   node scripts/deploy-phase2.mjs
 *
 * Writes ../../deployments/poseidon-testnet.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const circuits = join(__dirname, "..");

const RPC = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const pk = process.env.DEPLOYER_PK;
if (!pk) {
  console.error("Set DEPLOYER_PK");
  process.exit(1);
}

async function main() {
  const { poseidonContract } = await import("circomlibjs");
  const { ethers } = await import("ethers");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(
    pk.startsWith("0x") ? pk : `0x${pk}`,
    provider
  );
  console.log("deployer", wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log("balance", ethers.formatEther(bal), "ETH");

  async function deployPoseidon(n) {
    const abi = poseidonContract.generateABI(n);
    const bytecode = poseidonContract.createCode(n);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    console.log(`deploying Poseidon${n}...`);
    const c = await factory.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(`Poseidon${n}`, addr);
    return addr;
  }

  function loadArtifact(name) {
    const p = join(root, "out", name, `${name}.json`);
    if (!existsSync(p)) {
      throw new Error(
        `Missing ${p} — run: cd contracts && forge build`
      );
    }
    return JSON.parse(readFileSync(p, "utf8"));
  }

  async function deployArtifact(name, args = []) {
    const art = loadArtifact(name);
    const factory = new ethers.ContractFactory(
      art.abi,
      art.bytecode.object,
      wallet
    );
    console.log(`deploying ${name}...`, args);
    const c = await factory.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(name, addr);
    return addr;
  }

  const poseidon2 = await deployPoseidon(2);
  const poseidon3 = await deployPoseidon(3);
  const unshieldVerifier = await deployArtifact("UnshieldVerifier");
  const unshieldIVerifier = await deployArtifact("UnshieldIVerifier", [
    unshieldVerifier,
  ]);
  const pool = await deployArtifact("ShieldPoolPoseidon", [
    poseidon2,
    unshieldIVerifier,
  ]);

  const net = await provider.getNetwork();
  const out = {
    chainId: Number(net.chainId),
    network: "Robinhood Chain Testnet",
    rpc: RPC,
    hashScheme: "poseidon",
    proofLayout: 2,
    contracts: {
      Poseidon2: poseidon2,
      Poseidon3: poseidon3,
      UnshieldVerifier: unshieldVerifier,
      UnshieldIVerifier: unshieldIVerifier,
      ShieldPoolPoseidon: pool,
    },
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
    notes:
      "Phase-2 Poseidon pool with real unshield verifier (dev ceremony keys). Keccak pool 0x2BD9… is separate.",
  };

  const depDir = join(root, "deployments");
  mkdirSync(depDir, { recursive: true });
  const outPath = join(depDir, "poseidon-testnet.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("wrote", outPath);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
