import { zeroAddress, type Address } from "viem";

/** Native ETH is represented as the zero address across the vault. */
export const NATIVE_ASSET: Address = zeroAddress;

/** BN254 scalar field modulus. */
export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Robinhood Chain. */
export const RH_TESTNET_CHAIN_ID = 46630;
export const RH_MAINNET_CHAIN_ID = 4663;

/** Tempo Moderato testnet. Payments-first stablecoin L1; native is USD and it
 *  blocks native msg.value, so shields there are ERC-20-only (PathUSD, 6-dec). */
export const TEMPO_TESTNET_CHAIN_ID = 42431;

/** Contracts of record (RH testnet 46630). */
// No-middlemen Poseidon pool (shieldVerifier enforced, no emergencyWithdraw,
// admin changes behind a public 3-day timelock). Redeployed 2026-09-29;
// supersedes 0xAc25c3C4A880194324d1fC78722694e0F315aF1c and 0xaEbB…1834.
// NEVER the drainable pre-C1 pool 0x4F38…12D8F (audit H-P1).
export const SEALED_VAULT: Address =
  "0x72406D9597807A46f730d8b4fDBC5aC45Dc1d740";
export const SEALED_VAULT_DEPLOY_BLOCK = 126_185_021n;
export const GLOAM_PAY_MEMO: Address =
  "0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE";
/** ShieldIVerifier adapter — set as the pool's shieldVerifier; shield() reverts,
 *  deposits must go through shieldBound() with a proof. */
export const SHIELD_VERIFIER: Address =
  "0x28E6d0D02568EE634f9596645775275DE76b2847";

/** No-middlemen Poseidon pool on Tempo Moderato (42431). Redeployed 2026-09-29,
 *  reuses the same verifiers + Poseidon2 as Robinhood, so the same circuits and
 *  proving path work unchanged — only the pool address and chain id differ. */
export const TEMPO_SEALED_VAULT: Address =
  "0x841DC046Ea3CC842BA3A855731472c6Eb0F2d5eb";
export const TEMPO_SEALED_VAULT_DEPLOY_BLOCK = 37_411_195n;
/** Encrypted payment-message board on Tempo (event has no poster address). */
export const TEMPO_PAY_MEMO: Address =
  "0x3ca88712e9219b5EE4c82D31cAfEaB64C9E9b4E3";
/** Paxos Global Dollar (USDG) on Robinhood Chain testnet, 6 decimals. */
export const RH_USDG: Address =
  "0x7E955252E15c84f5768B83c41a71F9eba181802F";
/** PathUSD, the primary 6-decimal shieldable stablecoin on Tempo. */
export const TEMPO_PATHUSD: Address =
  "0x20c0000000000000000000000000000000000000";

/**
 * The networks Gloam's private core runs on. Robinhood Chain and Tempo are
 * separate deployments of the same shielded-pool design (not a bridge, not one
 * cross-chain pool) — an app or agent picks one and points the builders at that
 * network's pool and chain id.
 */
export interface GloamNetwork {
  key: "robinhood" | "tempo";
  label: string;
  chainId: number;
  /** Shielded pool address. */
  pool: Address;
  /** Block the pool was deployed at (start of tree scans). */
  deployBlock: bigint;
  /** Encrypted payment-message board for this network. */
  payMemo: Address;
  /** Whether native-value shields are allowed (Tempo blocks native msg.value). */
  nativeShield: boolean;
}

export const GLOAM_NETWORKS: Record<GloamNetwork["key"], GloamNetwork> = {
  robinhood: {
    key: "robinhood",
    label: "Robinhood Chain",
    chainId: RH_TESTNET_CHAIN_ID,
    pool: SEALED_VAULT,
    deployBlock: SEALED_VAULT_DEPLOY_BLOCK,
    payMemo: GLOAM_PAY_MEMO,
    nativeShield: true,
  },
  tempo: {
    key: "tempo",
    label: "Tempo",
    chainId: TEMPO_TESTNET_CHAIN_ID,
    pool: TEMPO_SEALED_VAULT,
    deployBlock: TEMPO_SEALED_VAULT_DEPLOY_BLOCK,
    payMemo: TEMPO_PAY_MEMO,
    nativeShield: false,
  },
};

/** Resolve the Gloam network for a chain id, or undefined if unsupported. */
export function networkForChainId(chainId: number): GloamNetwork | undefined {
  return Object.values(GLOAM_NETWORKS).find((n) => n.chainId === chainId);
}
