#!/usr/bin/env node
/**
 * Deploy PoseidonT3 (2-in) + PoseidonT4 (3-in) from circomlibjs bytecode.
 *
 *   export DEPLOYER_PK=0x...
 *   export RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   node scripts/deploy-poseidon.mjs
 *
 * POSEIDON_T3_ONLY=1 deploys PoseidonT3 alone, all a mainnet pool (ShieldPoolPayments)
 * hashes with. From a deployer with no transactions on the chain it lands at nonce 0,
 * 0x1a32C2c2A77225EC2dD3BF7be1018819b1039Cb4, and the MainnetDeploy pool after it lands
 * at the same address as on Robinhood Chain and Tempo mainnet.
 *
 * PRIORITY_FEE_GWEI sets the tip. Without it, ethers v5 tips 1.5 gwei, which on
 * Ethereum can be fifty times the base fee itself; with it, the max fee is twice
 * the latest base fee plus that tip. Leave it unset on the L2s.
 */
import { writeFileSync, mkdirSync } from "fs";

const RPC = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const T3_ONLY = process.env.POSEIDON_T3_ONLY === "1";
// Never hardcode — read from environment only (secret scanners flag inline keys)
const pk = process.env.DEPLOYER_PK;
if (!pk || !pk.startsWith("0x") || pk.length < 66) {
  console.error("Set DEPLOYER_PK to a funded testnet key (env only, never commit).");
  process.exit(1);
}

// viem may not be in circuits package — fall back to ethers if needed
async function main() {
  const { poseidonContract } = await import("circomlibjs");
  const { ethers } = await import("ethers");

  // Work on either ethers v6 (ethers.JsonRpcProvider) or v5 (ethers.providers.*).
  const ProviderCtor = ethers.JsonRpcProvider ?? ethers.providers?.JsonRpcProvider;
  const provider = new ProviderCtor(RPC);
  const wallet = new ethers.Wallet(pk, provider);

  async function feeOverrides() {
    const tip = process.env.PRIORITY_FEE_GWEI?.trim();
    if (!tip) return {};
    const parseUnits = ethers.parseUnits ?? ethers.utils.parseUnits;
    const block = await provider.getBlock("latest");
    const base = BigInt(block.baseFeePerGas.toString());
    const t = BigInt(parseUnits(tip, "gwei").toString());
    return { maxPriorityFeePerGas: t.toString(), maxFeePerGas: (base * 2n + t).toString() };
  }

  async function deploy(nInputs, name) {
    const abi = poseidonContract.generateABI(nInputs);
    const bytecode = poseidonContract.createCode(nInputs);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const c = await factory.deploy(await feeOverrides());
    if (typeof c.waitForDeployment === "function") await c.waitForDeployment();
    else if (typeof c.deployed === "function") await c.deployed();
    const addr = typeof c.getAddress === "function" ? await c.getAddress() : c.address;
    console.log(name, addr);
    return { name, nInputs, address: addr, abi };
  }

  const { chainId } = await provider.getNetwork();
  const nonce = await provider.getTransactionCount(wallet.address);
  console.log("chainId", String(chainId), "deployer", wallet.address, "nonce", nonce);

  const p2 = await deploy(2, "Poseidon2");
  const p3 = T3_ONLY ? null : await deploy(3, "Poseidon3");

  mkdirSync("build/poseidon", { recursive: true });
  const out = {
    rpc: RPC,
    chainId: String(chainId),
    Poseidon2: p2.address,
    ...(p3 ? { Poseidon3: p3.address } : {}),
  };
  writeFileSync("build/poseidon/deployed.json", JSON.stringify(out, null, 2));
  console.log("wrote build/poseidon/deployed.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
