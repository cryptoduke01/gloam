/**
 * ShieldPool integration surface (testnet).
 * Addresses filled after `forge script` deploy → deployments/testnet.json
 */

export const SHIELD_POOL_ADDRESS =
  process.env.NEXT_PUBLIC_SHIELD_POOL_ADDRESS ?? null;

export const shieldPoolAbi = [
  {
    type: "function",
    name: "shield",
    stateMutability: "payable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "nextIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposited",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isSpent",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "event",
    name: "Shielded",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "leafIndex", type: "uint256", indexed: false },
      { name: "from", type: "address", indexed: true },
    ],
  },
] as const;

export function isShieldDeployed() {
  return Boolean(
    SHIELD_POOL_ADDRESS &&
      SHIELD_POOL_ADDRESS !== "null" &&
      SHIELD_POOL_ADDRESS.startsWith("0x")
  );
}
