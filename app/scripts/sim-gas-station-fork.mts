/**
 * The whole gas step on a local fork of Robinhood Chain mainnet, through the
 * relay's real code and Borro's real bytecode. Nothing is broadcast anywhere:
 *
 *  - anvil forks the chain and every transaction lands on that local copy
 *  - fetch is replaced for this process with one that refuses every host but the
 *    local node, so a relay send can't reach a live RPC even if anvil dies
 *  - the relay key is a throwaway made here, funded only on the fork
 *  - the test wallets are made here too and start with no ETH
 *
 * USDG reaches the station from the vault's own address, as a cash out's would.
 * The proof and the vault's unshield are not run: lib/freshWallet leaves those to
 * the same code every cash out uses.
 *
 * Checks, in order: refused with the flag off; USDG sent before the station
 * exists waits there; refused above the gas limit, which is anvil's own price;
 * then at mainnet's price the relay makes it and pumps it through relayGasStation;
 * the ETH reaches the wallet; the wallet pays for a transaction of its own with
 * it; a copy right after is refused; getGas does both steps for a second wallet;
 * copies sent together go out once; a wallet with gas still gets what waits at
 * its station; a contract wallet, which pump would run on the relay's gas, is
 * refused; and with the price feed gone stale the relay refuses, nothing is lost,
 * and release() pays the wallet in USDG.
 *
 * Run from app/ (anvil on PATH, one heavy-job slot held):
 *   ../mcp/node_modules/.bin/tsx scripts/sim-gas-station-fork.mts
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { encodeFunctionData, formatEther, parseAbi, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const UPSTREAM = "https://rpc.mainnet.chain.robinhood.com";
const PORT = 20_000 + Math.floor(Math.random() * 20_000);
const LOCAL = `http://127.0.0.1:${PORT}`;
const U = 1_000_000n;

/** anvil adds its own 1 gwei tip to eth_gasPrice. Once set, this is the price quoted instead: mainnet's. */
let quotedGasPrice: bigint | null = null;

// Every chain call in this process stays on the local node. Checked before anything else runs.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(LOCAL)) throw new Error(`refused: this run only talks to the local fork, not ${url}`);
  const res = await realFetch(input, init);
  if (quotedGasPrice === null || typeof init?.body !== "string" || !init.body.includes("eth_gasPrice")) return res;
  const asked = JSON.parse(init.body) as { id: number; method: string } | { id: number; method: string }[];
  const answer = (await res.json()) as { id: number; result?: string } | { id: number; result?: string }[];
  const priced = new Set((Array.isArray(asked) ? asked : [asked]).filter((r) => r.method === "eth_gasPrice").map((r) => r.id));
  const patch = <T extends { id: number; result?: string }>(r: T) => (priced.has(r.id) ? { ...r, result: toHex(quotedGasPrice!) } : r);
  return new Response(JSON.stringify(Array.isArray(answer) ? answer.map(patch) : patch(answer)), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.CHAINALYSIS_API_KEY;
delete process.env.GLOAM_RELAY_GAS_STATION;
const relayKey = generatePrivateKey();
const relayer = privateKeyToAccount(relayKey).address;
process.env.GLOAM_RELAYER_PRIVATE_KEY = relayKey;
process.env.GLOAM_RPC_URL_4663 = LOCAL;

const anvil = spawn(
  "anvil",
  ["--fork-url", UPSTREAM, "--port", String(PORT), "--chain-id", "4663", "--silent", "--no-rate-limit", "--no-storage-caching"],
  { stdio: ["ignore", "ignore", "pipe"] }
);
let anvilErr = "";
anvil.stderr?.on("data", (d) => (anvilErr += String(d)));
process.on("exit", () => anvil.kill());

let rpcId = 0;
async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await realFetch(LOCAL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

const deadline = Date.now() + 60_000;
for (;;) {
  try {
    assert.equal(await rpc<string>("eth_chainId"), toHex(4663));
    break;
  } catch (e) {
    if (Date.now() > deadline || anvil.exitCode !== null) throw new Error(`anvil did not start: ${anvilErr.slice(0, 300) || String(e)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
// The fork's head has no blob fields; a block of anvil's own does (packages/game-plugin-gloam/test/fork/harness.mts).
await rpc("anvil_mine", ["0x1"]);
await rpc("anvil_setBalance", [relayer, toHex(10n ** 18n)]);

const { GAS_STATION_FACTORY, STATION_USDG, WALLET_GAS_OK_WEI, fundingStep, gasStationAbi, gasStationFactoryAbi, predictStation, readStationState } = await import("../src/lib/gasStation");
const { STATION_MAX_ESTIMATE } = await import("../src/lib/relay/gasStation");
const { RelayError, relayGasStation, relayPublicClient } = await import("../src/lib/relay/server");
const { getGas } = await import("../src/lib/freshWallet");
const { getNetwork } = await import("../src/lib/networks");

const net = getNetwork("robinhood-mainnet");
const pub = relayPublicClient(net);
const VAULT = net.pool!;
const erc20 = parseAbi(["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const stationAbi = parseAbi(["function recipient() view returns (address)", "function stuck() view returns (bool)", "function release() returns (uint256,uint256)"]);

function log(line: string) {
  console.log(line);
}

/** A transaction from any address, on the fork only. The gas is named: anvil would otherwise reserve a whole block's on this chain. */
async function sendAs(from: Address, to: Address, data: Hex, gas = 1_000_000n) {
  await rpc("anvil_impersonateAccount", [from]);
  try {
    const hash = await rpc<Hex>("eth_sendTransaction", [{ from, to, data, gas: toHex(gas) }]);
    return await pub.waitForTransactionReceipt({ hash });
  } finally {
    await rpc("anvil_stopImpersonatingAccount", [from]);
  }
}

/** USDG leaving the vault's own address, as a cash out's would. */
async function cashOut(to: Address, amount: bigint) {
  await rpc("anvil_setBalance", [VAULT, toHex(10n ** 18n)]);
  const r = await sendAs(VAULT, STATION_USDG, encodeFunctionData({ abi: erc20, functionName: "transfer", args: [to, amount] }));
  assert.equal(r.status, "success", "the vault must hold USDG on the fork");
}

const relayStep = async (wallet: Address, step: "make" | "pump") => {
  const hash = await relayGasStation(net, { wallet, step }, "127.0.0.1");
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.from.toLowerCase(), relayer.toLowerCase(), "the relay paid");
  return receipt;
};
const refusedWith = (code: string) => (e: unknown) => {
  assert.ok(e instanceof RelayError, String(e));
  assert.equal(e.code, code);
  return true;
};

log(`fork of chain ${await rpc<string>("eth_chainId")} at block ${await pub.getBlockNumber()}, gas price ${await pub.getGasPrice()} wei`);

// ---------------------------------------------------------------- one wallet, by hand

const wallet = privateKeyToAccount(generatePrivateKey()).address;
const station = predictStation(wallet);
log(`\ntest wallet ${wallet}\nstation     ${station}`);

await assert.rejects(relayGasStation(net, { wallet, step: "make" }, "127.0.0.1"), refusedWith("station_off"));
log("ok  flag off: the relay refuses");
process.env.GLOAM_RELAY_GAS_STATION = "on";

let s = await readStationState(pub, wallet);
assert.equal(s.station, station, "the factory agrees with the address worked out here");
assert.equal(s.made, false);
assert.equal(s.walletEth, 0n);
assert.equal(fundingStep(s), "fund");
log("ok  the factory's predict matches the local address; the wallet starts with 0 ETH");

await assert.rejects(relayGasStation(net, { wallet, step: "make" }, "127.0.0.1"), refusedWith("no_usdg"));
log("ok  nothing at the station: make refused, no gas spent");

await cashOut(station, U);
await cashOut(wallet, 25n * U);
s = await readStationState(pub, wallet);
assert.equal(s.made, false, "no station yet");
assert.equal(s.stationUsdg, U, "USDG waits at the address before the station exists");
assert.equal(fundingStep(s), "make");
log("ok  USDG sent to the predicted address waits there before the station exists");

await assert.rejects(relayGasStation(net, { wallet, step: "make" }, "127.0.0.1"), refusedWith("gas_high"));
log(`ok  at anvil's own ${await pub.getGasPrice()} wei the gas limit holds: nothing sent`);
quotedGasPrice = 20_136_000n;

const made = await relayStep(wallet, "make");
s = await readStationState(pub, wallet);
assert.equal(s.made, true);
assert.equal(s.stationUsdg, U, "the USDG survives make");
assert.equal(await pub.readContract({ address: station, abi: stationAbi, functionName: "recipient" }), wallet);
assert.equal(fundingStep(s), "pump");
log(`ok  make through the relay: ${made.gasUsed} gas, the station pays only ${wallet}`);

await assert.rejects(relayGasStation(net, { wallet, step: "make" }, "127.0.0.1"), refusedWith("in_flight"));
log("ok  a copy of the make right after it is refused");

// anvil copies the pool's ticks from the live chain on first touch, which can outlast the relay's 20 s read timeout.
const warmStart = Date.now();
const warm = await rpc<Hex>("eth_call", [{ from: relayer, to: station, data: encodeFunctionData({ abi: gasStationAbi, functionName: "pump", args: [0n, U] }) }, "latest"]);
assert.ok(BigInt(warm) > 0n, "a fill");
log(`ok  the same pump, simulated first: fills ${formatEther(BigInt(warm))} ETH (${((Date.now() - warmStart) / 1000).toFixed(1)} s on the fork's first touch of the pool)`);

const pumped = await relayStep(wallet, "pump");
s = await readStationState(pub, wallet);
assert.ok(s.walletEth >= WALLET_GAS_OK_WEI, "ETH reached the wallet");
assert.equal(s.stationUsdg, 0n, "the station is empty");
assert.equal(s.walletUsdg, 25n * U, "the wallet's USDG was never touched");
assert.equal(fundingStep(s), "ready");
const ethFromPump = s.walletEth;
log(`ok  pump through the relay: ${pumped.gasUsed} gas, 1 USDG became ${formatEther(s.walletEth)} ETH in the wallet`);

await assert.rejects(relayGasStation(net, { wallet, step: "pump" }, "127.0.0.1"), refusedWith("in_flight"));
log("ok  a copy of the pump right after it is refused");

// pump on an empty station succeeds on chain and does nothing: only the relay's own check stops it
const bare = privateKeyToAccount(generatePrivateKey()).address;
await sendAs(relayer, GAS_STATION_FACTORY, encodeFunctionData({ abi: gasStationFactoryAbi, functionName: "make", args: [bare] }));
const noop = await rpc<Hex>("eth_call", [{ from: relayer, to: predictStation(bare), data: encodeFunctionData({ abi: gasStationAbi, functionName: "pump", args: [0n, U] }) }, "latest"]);
assert.equal(BigInt(noop), 0n, "the chain would take the gas and do nothing");
await assert.rejects(relayGasStation(net, { wallet: bare, step: "pump" }, "127.0.0.1"), refusedWith("no_usdg"));
log("ok  an empty station would take gas and do nothing on chain: the relay refuses it first");

const spend = await sendAs(wallet, STATION_USDG, encodeFunctionData({ abi: erc20, functionName: "approve", args: [station, 1n] }), 200_000n);
assert.equal(spend.status, "success");
const left = await pub.getBalance({ address: wallet });
assert.ok(left < ethFromPump, "the wallet paid for it");
log(`ok  the wallet sends its own transaction, paid from the pumped ETH: ${spend.gasUsed} gas, ${formatEther(ethFromPump - left)} ETH`);

// ---------------------------------------------------------------- the app's driver

const second = privateKeyToAccount(generatePrivateKey()).address;
await cashOut(predictStation(second), 2n * U);
const states: string[] = [];
const done = await getGas({
  wallet: second,
  onStatus: (t) => states.push(t),
  deps: {
    read: (w) => readStationState(pub, w),
    send: (p) => relayGasStation(net, p, "127.0.0.1"),
    wait: async (hash) => (await pub.waitForTransactionReceipt({ hash })).status,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  },
});
assert.equal(fundingStep(done), "ready");
assert.deepEqual(states, ["Making the gas station…", "Turning USDG into ETH…"]);
log(`ok  getGas does both steps for a new wallet: ${formatEther(done.walletEth)} ETH from 2 USDG`);

// ---------------------------------------------------------------- copies, second fundings, contracts

const pumpData = (maxIn: bigint) => encodeFunctionData({ abi: gasStationAbi, functionName: "pump", args: [0n, maxIn] });
const estimateFor = async (to: Address, data: Hex) => BigInt(await rpc<Hex>("eth_estimateGas", [{ from: relayer, to, data }]));

const racer = privateKeyToAccount(generatePrivateKey()).address;
await cashOut(predictStation(racer), U);
await relayStep(racer, "make");
const eoaEstimate = await estimateFor(predictStation(racer), pumpData(U));
assert.ok(eoaEstimate < STATION_MAX_ESTIMATE, "an ordinary pump clears the cap");
const nonceBefore = await pub.getTransactionCount({ address: relayer });
const raced = await Promise.allSettled([1, 2, 3].map(() => relayGasStation(net, { wallet: racer, step: "pump" }, "127.0.0.1")));
assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
for (const r of raced) if (r.status === "rejected") refusedWith("in_flight")(r.reason);
assert.equal((await pub.getTransactionCount({ address: relayer })) - nonceBefore, 1, "one transaction");
log(`ok  3 pumps sent together: 1 transaction, 2 refused; an ordinary pump estimates ${eoaEstimate} gas`);

// A second funding: the wallet already has gas and more USDG lands at its station.
const stocked = privateKeyToAccount(generatePrivateKey()).address;
await rpc("anvil_setBalance", [stocked, toHex(10n ** 15n)]);
await cashOut(predictStation(stocked), U);
assert.equal(fundingStep(await readStationState(pub, stocked)), "make");
const topped = await getGas({
  wallet: stocked,
  deps: {
    read: (w) => readStationState(pub, w),
    send: (p) => relayGasStation(net, p, "127.0.0.1"),
    wait: async (hash) => (await pub.waitForTransactionReceipt({ hash })).status,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  },
});
assert.equal(topped.stationUsdg, 0n, "nothing stranded");
assert.ok(topped.walletEth > 10n ** 15n);
log("ok  a wallet that already has gas still gets what waits at its station");

// A contract wallet: pump hands it all the gas left, so this loop would run on the relay's gas.
const contract = privateKeyToAccount(generatePrivateKey()).address;
await cashOut(predictStation(contract), U);
await sendAs(relayer, GAS_STATION_FACTORY, encodeFunctionData({ abi: gasStationFactoryAbi, functionName: "make", args: [contract] }));
await rpc("anvil_setCode", [contract, "0x6120005b600190038060035700"]);
const contractEstimate = await estimateFor(predictStation(contract), pumpData(U));
assert.ok(contractEstimate > STATION_MAX_ESTIMATE, "this wallet would clear the cap");
assert.equal(fundingStep(await readStationState(pub, contract)), "contract");
await assert.rejects(relayGasStation(net, { wallet: contract, step: "pump" }, "127.0.0.1"), refusedWith("wallet_code"));
assert.equal((await readStationState(pub, contract)).stationUsdg, U, "nothing moved");
log(`ok  a contract wallet is refused: its pump estimates ${contractEstimate} gas, over the ${STATION_MAX_ESTIMATE} cap`);

// ---------------------------------------------------------------- a stale price feed

const third = privateKeyToAccount(generatePrivateKey()).address;
const thirdStation = predictStation(third);
await cashOut(thirdStation, U);
await relayStep(third, "make");
await rpc("evm_increaseTime", [350_000]);
await rpc("evm_mine");
assert.equal(await pub.readContract({ address: thirdStation, abi: stationAbi, functionName: "stuck" }), true);
await assert.rejects(relayGasStation(net, { wallet: third, step: "pump" }, "127.0.0.1"), refusedWith("check_failed"));
assert.equal((await readStationState(pub, third)).stationUsdg, U, "nothing lost");
log("ok  price feed stale for over 4 days: the relay refuses a pump and the USDG stays put");

await rpc("anvil_setBalance", [relayer, toHex(10n ** 18n)]);
const released = await sendAs(relayer, thirdStation, encodeFunctionData({ abi: stationAbi, functionName: "release" }));
assert.equal(released.status, "success");
const after = await readStationState(pub, third);
assert.equal(after.stationUsdg, 0n);
assert.equal(after.walletUsdg, U, "release paid the wallet in USDG");
log("ok  release() pays the wallet in USDG, whoever calls it");

log(`\nmake + pump: ${made.gasUsed + pumped.gasUsed} gas`);
log("all passed");
anvil.kill();
process.exit(0);
