import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MCP_NETWORKS, type McpNetwork } from "./networks.js";

function chainFor(net: McpNetwork) {
  return defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: { default: { http: [net.rpc] } },
  });
}

/**
 * The agent's testnet signer, for a given Gloam network (defaults to Robinhood).
 *
 * v0 uses a testnet private key from GLOAM_AGENT_PRIVATE_KEY for the execution
 * rail. Production should swap this for a Turnkey server wallet with policy
 * guardrails (spend limits, allowed contracts) so the agent never holds a raw
 * key. Tools return plans instead of executing when no signer is configured.
 */
export function getSigner(net: McpNetwork = MCP_NETWORKS.robinhood) {
  const pk = process.env.GLOAM_AGENT_PRIVATE_KEY;
  if (!pk) return null;
  const key = (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
  const account = privateKeyToAccount(key);
  const chain = chainFor(net);
  return {
    account,
    network: net,
    walletClient: createWalletClient({ account, chain, transport: http(net.rpc) }),
    publicClient: createPublicClient({ chain, transport: http(net.rpc) }),
  };
}
