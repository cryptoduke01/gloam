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
// Hardened Poseidon pool (shieldVerifier enforced). Redeployed 2026-09-16 with the
// Kensho audit-pass fixes; supersedes 0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834.
// NEVER the drainable pre-C1 pool 0x4F38…12D8F (audit H-P1).
export const SEALED_VAULT: Address =
  "0xAc25c3C4A880194324d1fC78722694e0F315aF1c";
export const GLOAM_PAY_MEMO: Address =
  "0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE";
/** ShieldIVerifier adapter — set as the pool's shieldVerifier; shield() reverts,
 *  deposits must go through shieldBound() with a proof. */
export const SHIELD_VERIFIER: Address =
  "0x28E6d0D02568EE634f9596645775275DE76b2847";

/** Hardened Poseidon pool on Tempo Moderato (42431). Redeployed 2026-09-16,
 *  reuses the same verifiers + Poseidon2 as Robinhood, so the same circuits and
 *  proving path work unchanged — only the pool address and chain id differ. */
export const TEMPO_SEALED_VAULT: Address =
  "0xeD0b0F8eE6206eCd87cF47Fc1C5220d15C6e2276";
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
  /** Whether native-value shields are allowed (Tempo blocks native msg.value). */
  nativeShield: boolean;
}

export const GLOAM_NETWORKS: Record<GloamNetwork["key"], GloamNetwork> = {
  robinhood: {
    key: "robinhood",
    label: "Robinhood Chain",
    chainId: RH_TESTNET_CHAIN_ID,
    pool: SEALED_VAULT,
    nativeShield: true,
  },
  tempo: {
    key: "tempo",
    label: "Tempo",
    chainId: TEMPO_TESTNET_CHAIN_ID,
    pool: TEMPO_SEALED_VAULT,
    nativeShield: false,
  },
};

/** Resolve the Gloam network for a chain id, or undefined if unsupported. */
export function networkForChainId(chainId: number): GloamNetwork | undefined {
  return Object.values(GLOAM_NETWORKS).find((n) => n.chainId === chainId);
}
