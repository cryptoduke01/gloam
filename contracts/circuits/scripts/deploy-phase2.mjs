#!/usr/bin/env node
/**
 * Deploy Phase-2 Poseidon stack to Robinhood testnet:
 *   Poseidon2, Poseidon3, UnshieldVerifier, UnshieldIVerifier, ShieldPoolPoseidon
 *
 * Supports ethers v5 (pulled by circomlibjs) and v6.
 *
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   node scripts/deploy-phase2.mjs
 *
 * Writes ../../deployments/poseidon-testnet.json
 *
 * NEVER commit DEPLOYER_PK. If you pasted a key in chat, rotate it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
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
const pk = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;

function loadEthers() {
  // Prefer CJS require — works for both v5 and v6 package layouts
  const ethers = require("ethers");
  return ethers.ethers ?? ethers;
}

function isV6(ethers) {
  return typeof ethers.JsonRpcProvider === "function";
}

async function main() {
  const { poseidonContract } = await import("circomlibjs");
  const ethers = loadEthers();
  const v6 = isV6(ethers);

  const provider = v6
    ? new ethers.JsonRpcProvider(RPC)
    : new ethers.providers.JsonRpcProvider(RPC);

  const wallet = new ethers.Wallet(pk, provider);
  console.log("ethers", ethers.version || (v6 ? "v6" : "v5"));
  console.log("deployer", wallet.address);

  const bal = await provider.getBalance(wallet.address);
  const balEth = v6
    ? ethers.formatEther(bal)
    : ethers.utils.formatEther(bal);
  console.log("balance", balEth, "ETH");

  async function waitDeployed(contract) {
    if (v6) {
      await contract.waitForDeployment();
      return await contract.getAddress();
    }
    await contract.deployed();
    return contract.address;
  }

  async function deployPoseidon(n) {
    const abi = poseidonContract.generateABI(n);
    let bytecode = poseidonContract.createCode(n);
    if (!bytecode.startsWith("0x")) bytecode = `0x${bytecode}`;
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    console.log(`deploying Poseidon${n}...`);
    const c = await factory.deploy();
    const addr = await waitDeployed(c);
    console.log(`Poseidon${n}`, addr);
    return addr;
  }

  function loadArtifact(name) {
    // Foundry: out/Contract.sol/Contract.json (preferred) or out/Contract/Contract.json
    const candidates = [
      join(root, "out", `${name}.sol`, `${name}.json`),
      join(root, "out", name, `${name}.json`),
    ];
    const p = candidates.find((c) => existsSync(c));
    if (!p) {
      throw new Error(
        `Missing artifact for ${name}. Tried:\n  ${candidates.join("\n  ")}\nRun: cd contracts && forge build`
      );
    }
    return JSON.parse(readFileSync(p, "utf8"));
  }

  async function deployArtifact(name, args = []) {
    const art = loadArtifact(name);
    const bytecode =
      typeof art.bytecode === "string"
        ? art.bytecode
        : art.bytecode.object;
    const factory = new ethers.ContractFactory(art.abi, bytecode, wallet);
    console.log(`deploying ${name}...`, args);
    const c = await factory.deploy(...args);
    const addr = await waitDeployed(c);
    console.log(name, addr);
    return addr;
  }

  // Resume: reuse already-deployed Poseidon hashers if set
  //   export POSEIDON2=0xcc2d... POSEIDON3=0x3242...
  const poseidon2 =
    process.env.POSEIDON2 || (await deployPoseidon(2));
  const poseidon3 =
    process.env.POSEIDON3 || (await deployPoseidon(3));
  if (process.env.POSEIDON2) console.log("reuse Poseidon2", poseidon2);
  if (process.env.POSEIDON3) console.log("reuse Poseidon3", poseidon3);

  const unshieldVerifier = await deployArtifact("UnshieldVerifier");
  const unshieldIVerifier = await deployArtifact("UnshieldIVerifier", [
    unshieldVerifier,
  ]);
  const pool = await deployArtifact("ShieldPoolPoseidon", [
    poseidon2,
    unshieldIVerifier,
  ]);

  const net = await provider.getNetwork();
  const chainId = Number(net.chainId ?? net.chainId);

  // best-effort deploy block
  let deployBlock = null;
  try {
    deployBlock = await provider.getBlockNumber();
  } catch {
    /* ignore */
  }

  const out = {
    chainId,
    network: "Robinhood Chain Testnet",
    rpc: RPC,
    hashScheme: "poseidon",
    proofLayout: 2,
    deployBlock,
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
  console.log("\nApp env:");
  console.log(`NEXT_PUBLIC_POSEIDON_SHIELD_POOL=${pool}`);
  console.log("NEXT_PUBLIC_HASH_SCHEME=poseidon");
  if (deployBlock != null) {
    console.log(`NEXT_PUBLIC_SHIELD_DEPLOY_BLOCK=${deployBlock}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
