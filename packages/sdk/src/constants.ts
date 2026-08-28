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
export const SEALED_VAULT: Address =
  "0x4F38a4d80e5ca516A2e5549404C7be0E91c12D8F";
export const GLOAM_PAY_MEMO: Address =
  "0x689ebd9d30E0235c73fd8f10236F850CDB3c5DCE";
