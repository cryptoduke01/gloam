/**
 * Tempo Moderato testnet faucet. Tempo funds an address (native USD + the test
 * stablecoins PathUSD / AlphaUSD / BetaUSD / ThetaUSD) through a single RPC
 * method, `tempo_fundAddress`, rather than a web faucet. This lets the app claim
 * funds for the connected wallet directly, so a fresh wallet actually holds the
 * stablecoins it needs to shield and pay with.
 */
export async function fundTempoAddress(
  rpcUrl: string,
  address: string
): Promise<string[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tempo_fundAddress",
      params: [address],
    }),
  });
  if (!res.ok) throw new Error(`faucet_http_${res.status}`);
  const json = (await res.json()) as {
    result?: string[];
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message ?? "faucet_failed");
  return json.result ?? [];
}
