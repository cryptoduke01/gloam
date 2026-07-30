import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "./data.js";

export const rhTestnet = defineChain({
  id: CHAIN.chainId,
  name: CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [CHAIN.rpc] } },
});

/**
 * The agent's testnet signer.
 *
 * v0 uses a testnet private key from GLOAM_AGENT_PRIVATE_KEY for the execution
 * rail. Production should swap this for a Turnkey server wallet with policy
 * guardrails (spend limits, allowed contracts) so the agent never holds a raw
 * key. Tools return plans instead of executing when no signer is configured.
 */
export function getSigner() {
  const pk = process.env.GLOAM_AGENT_PRIVATE_KEY;
  if (!pk) return null;
  const key = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  const account = privateKeyToAccount(key);
  return {
    account,
    walletClient: createWalletClient({
      account,
      chain: rhTestnet,
      transport: http(CHAIN.rpc),
    }),
    publicClient: createPublicClient({
      chain: rhTestnet,
      transport: http(CHAIN.rpc),
    }),
  };
}
