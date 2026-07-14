#!/usr/bin/env node
/**
 * Deploy PoseidonT3 (2-in) + PoseidonT4 (3-in) from circomlibjs bytecode.
 *
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   node scripts/deploy-poseidon.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createWalletClient, http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const pk = process.env.DEPLOYER_PK;
if (!pk) {
  console.error("Set DEPLOYER_PK");
  process.exit(1);
}

// viem may not be in circuits package — fall back to ethers if needed
async function main() {
  const { poseidonContract } = await import("circomlibjs");
  const { ethers } = await import("ethers");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);

  async function deploy(nInputs, name) {
    const abi = poseidonContract.generateABI(nInputs);
    const bytecode = poseidonContract.createCode(nInputs);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const c = await factory.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(name, addr);
    return { name, nInputs, address: addr, abi };
  }

  const p2 = await deploy(2, "Poseidon2");
  const p3 = await deploy(3, "Poseidon3");

  mkdirSync("build/poseidon", { recursive: true });
  const out = {
    chain: "robinhood-testnet",
    Poseidon2: p2.address,
    Poseidon3: p3.address,
  };
  writeFileSync("build/poseidon/deployed.json", JSON.stringify(out, null, 2));
  console.log("wrote build/poseidon/deployed.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
