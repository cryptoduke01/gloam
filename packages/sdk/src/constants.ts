import { zeroAddress, type Address } from "viem";

/** Native ETH is represented as the zero address across the vault. */
export const NATIVE_ASSET: Address = zeroAddress;

/** BN254 scalar field modulus. */
export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Robinhood Chain. */
export const RH_TESTNET_CHAIN_ID = 46630;
export const RH_MAINNET_CHAIN_ID = 4663;

/** Contracts of record (RH testnet 46630). */
// Hardened Poseidon pool (C1/C2/C3, shieldVerifier enforced). NEVER the drainable
// pre-C1 pool 0x4F38…12D8F (audit H-P1).
export const SEALED_VAULT: Address =
  "0xaEbB8E3b5C4648Aa7Cc4E41d3Cec008Db4bb1834";
export const GLOAM_PAY_MEMO: Address =
  "0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE";
/** ShieldIVerifier adapter — set as the pool's shieldVerifier; shield() reverts,
 *  deposits must go through shieldBound() with a proof. */
export const SHIELD_VERIFIER: Address =
  "0x28E6d0D02568EE634f9596645775275DE76b2847";
