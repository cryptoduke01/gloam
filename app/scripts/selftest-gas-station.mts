/**
 * Self-test: Borro's gas station and what the relay will do for it
 * (lib/gasStation, lib/relay/gasStation, relayGasStation in lib/relay/server).
 *
 *  - the station's address worked out here matches the factory's own predict,
 *    for addresses read from Robinhood Chain mainnet
 *  - which step a wallet needs next, from the chain alone
 *  - off unless the flag is exactly "on": refused before any chain call, and the
 *    status says so
 *  - the relay sends only make to the factory and pump to the wallet's own
 *    station, whatever else a request says. Every raw transaction is decoded
 *    here, so this reads what really went out, not what was meant to
 *  - nothing is spent on a station with too little USDG, the trap being that
 *    pump on an empty station succeeds and does nothing, so a dry run passes it
 *  - nothing is spent for a wallet that can pay for itself, or above the gas limit
 *  - a pump never takes more than the cap, and its minimum follows the pool's fill
 *  - spend limits: per wallet, per sender and per day across everyone
 *  - the factory naming another station stops everything
 *  - screening and the cash-out target rules apply to the wallet
 *
 * fetch is stubbed for the whole run. Chain calls go to an in-process fake, the
 * relay key is a throwaway made here, and nothing reaches any host.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-gas-station.mts
 */
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeFunctionResult,
  getAddress,
  parseTransaction,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey } from "viem/accounts";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.CHAINALYSIS_API_KEY;
delete process.env.GLOAM_RELAY_GAS_STATION;
delete process.env.GLOAM_RELAY_GAS_STATION_DAILY;
process.env.GLOAM_RELAYER_PRIVATE_KEY = generatePrivateKey();

const {
  GAS_STATION_FACTORY,
  GAS_STATION_CHAIN_ID,
  STATION_MAX_PUMP_USDG,
  STATION_MIN_USDG,
  STATION_MISMATCH_MESSAGE,
  STATION_USDG,
  WALLET_GAS_OK_WEI,
  WALLET_PAYS_OWN_GAS_WEI,
  fundingStep,
  gasStationAbi,
  gasStationFactoryAbi,
  predictStation,
  readStationState,
} = await import("../src/lib/gasStation");
const {
  STATION_DAILY_DEFAULT,
  STATION_IP_HOURLY,
  STATION_MAX_GAS_PRICE_WEI,
  STATION_OFF_MESSAGE,
  STATION_WALLET_DAILY,
  gasStationDailySends,
  gasStationOn,
  pumpMaxIn,
  pumpMinOut,
  stationRefusal,
} = await import("../src/lib/relay/gasStation");
const { RelayError, relayGasStation, relayStatus } = await import("../src/lib/relay/server");
const { POST: relayPost } = await import("../src/app/api/relay/route");
const { getNetwork } = await import("../src/lib/networks");
const { relayGasStation: clientGasStation } = await import("../src/lib/relay/client");

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const net = getNetwork("robinhood-mainnet");
const testnet = getNetwork("robinhood");
assert.equal(net.chainId, GAS_STATION_CHAIN_ID);
assert.ok(net.pool);
const RPC = net.chain.rpcUrls.default.http[0]!;

const SEL = {
  make: toFunctionSelector("make(address)"),
  predict: toFunctionSelector("predict(address)"),
  pump: toFunctionSelector("pump(uint256,uint256)"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
};

let walletSeed = 1;
/** A new wallet per case, so one case's counts never touch another's. */
function freshWallet(): Address {
  walletSeed++;
  return getAddress(`0x${walletSeed.toString(16).padStart(4, "0")}${"ab".repeat(18)}`);
}

// ---------------------------------------------------------------- fake chain

type WalletChain = { made: boolean; stationUsdg: bigint; walletEth: bigint };
const chain = {
  wallets: new Map<string, WalletChain>(),
  gasPrice: 20_136_000n,
  /** What the factory's predict answers instead of the real address, when set. */
  wrongPredict: null as Address | null,
  fill: 442_345_771_441_961n,
  /** The next read of chain state refuses. */
  relayBalance: 10n ** 18n,
};
const calls: string[] = [];
const sent: { to: Address; data: Hex; value: bigint }[] = [];
const simulated: Hex[] = [];

function byStation(station: string): { wallet: string; c: WalletChain } | null {
  for (const [wallet, c] of chain.wallets) {
    if (predictStation(wallet as Address).toLowerCase() === station.toLowerCase()) return { wallet, c };
  }
  return null;
}

function callAnswer(to: string, data: Hex): Hex {
  const sel = data.slice(0, 10).toLowerCase();
  if (to.toLowerCase() === GAS_STATION_FACTORY.toLowerCase() && sel === SEL.predict.toLowerCase()) {
    const { args } = decodeFunctionData({ abi: gasStationFactoryAbi, data });
    return encodeFunctionResult({
      abi: gasStationFactoryAbi,
      functionName: "predict",
      result: chain.wrongPredict ?? predictStation(args[0] as Address),
    });
  }
  if (to.toLowerCase() === STATION_USDG.toLowerCase() && sel === SEL.balanceOf) {
    const who = `0x${data.slice(-40)}`;
    return toHex(byStation(who)?.c.stationUsdg ?? 0n, { size: 32 });
  }
  if (sel === SEL.pump.toLowerCase()) {
    simulated.push(data);
    return toHex(chain.fill, { size: 32 });
  }
  throw new Error(`fake chain: unexpected call to ${to}: ${sel}`);
}

const Z32 = "0x" + "00".repeat(32);
const BLOCK = {
  number: "0x1",
  hash: "0x" + "12".repeat(32),
  parentHash: Z32,
  nonce: "0x0000000000000000",
  sha3Uncles: Z32,
  logsBloom: "0x" + "00".repeat(256),
  transactionsRoot: Z32,
  stateRoot: Z32,
  receiptsRoot: Z32,
  miner: "0x" + "00".repeat(20),
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x0",
  gasLimit: "0x1000000",
  gasUsed: "0x0",
  timestamp: "0x1",
  transactions: [],
  uncles: [],
  baseFeePerGas: "0x1",
};

function answer(method: string, params: unknown[]): unknown {
  calls.push(method);
  switch (method) {
    case "eth_chainId":
      return toHex(net.chainId);
    case "eth_blockNumber":
      return "0x1";
    case "eth_gasPrice":
      return toHex(chain.gasPrice);
    case "eth_maxPriorityFeePerGas":
      return "0x1";
    case "eth_getBlockByNumber":
      return BLOCK;
    case "eth_estimateGas":
      return "0x30000";
    case "eth_getTransactionCount":
      return "0x0";
    case "eth_getCode": {
      const hit = byStation(params[0] as string);
      return hit?.c.made ? "0x363d3d37" : "0x";
    }
    case "eth_getBalance": {
      const who = (params[0] as string).toLowerCase();
      for (const [w, c] of chain.wallets) if (w.toLowerCase() === who) return toHex(c.walletEth);
      return toHex(chain.relayBalance);
    }
    case "eth_call": {
      const { to, data, input } = params[0] as { to: string; data?: Hex; input?: Hex };
      return callAnswer(to, (data ?? input)!);
    }
    case "eth_sendRawTransaction": {
      const tx = parseTransaction(params[0] as Hex);
      sent.push({ to: tx.to as Address, data: tx.data as Hex, value: tx.value ?? 0n });
      return "0x" + "ab".repeat(32);
    }
    case "eth_getTransactionReceipt":
      return null;
    default:
      throw new Error(`fake chain: unexpected ${method}`);
  }
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith(RPC)) throw new Error(`unexpected host: ${url}`);
  const body = JSON.parse(String(init?.body));
  const one = (r: { id: number; method: string; params: unknown[] }) => {
    try {
      return { jsonrpc: "2.0", id: r.id, result: answer(r.method, r.params) };
    } catch (e) {
      return { jsonrpc: "2.0", id: r.id, error: { code: -32000, message: e instanceof Error ? e.message : "no" } };
    }
  };
  return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

function setWallet(wallet: Address, c: Partial<WalletChain>): void {
  chain.wallets.set(wallet, { made: false, stationUsdg: 0n, walletEth: 0n, ...c });
}
function forget() {
  calls.length = 0;
  sent.length = 0;
  simulated.length = 0;
}
function isRelayError(code: string, status?: number) {
  return (e: unknown) => {
    assert.ok(e instanceof RelayError, `expected a RelayError, got ${String(e)}`);
    assert.equal(e.code, code);
    if (status) assert.equal(e.status, status);
    return true;
  };
}
const IP = () => `198.51.100.${walletSeed % 250}`;
const on = () => {
  process.env.GLOAM_RELAY_GAS_STATION = "on";
};
const off = () => {
  delete process.env.GLOAM_RELAY_GAS_STATION;
};

// ---------------------------------------------------------------- the address

await test("the address worked out here is the factory's: four wallets read from Robinhood Chain mainnet", () => {
  const read: [Address, Address][] = [
    ["0x000000000000000000000000000000000000dEaD", "0x622331b0Bb1389Eff31887f0e5615b158229ed7C"],
    ["0x1111111111111111111111111111111111111b0b", "0x4E2F4e78A0EE29F87cBcb1D28a447e78446ca36B"],
    ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x4B8A34A1b0Bf14bdeA50E7Aa81ace09801C0aCae"],
    ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "0x444E33ab1472Cb3B9C223E93BE94c10Adab52d21"],
  ];
  for (const [wallet, station] of read) assert.equal(predictStation(wallet), station);
});

await test("the selectors the relay sends are the ones in the deployed bytecode", () => {
  assert.equal(SEL.make, "0x1060930d");
  assert.equal(SEL.predict, "0x901b96e7");
  assert.equal(SEL.pump, "0xdbd5ac62");
});

// ---------------------------------------------------------------- the next step

await test("the next step comes from the chain alone", () => {
  const s = (made: boolean, stationUsdg: bigint, walletEth = 0n) => fundingStep({ made, stationUsdg, walletEth });
  assert.equal(s(false, 0n), "fund");
  assert.equal(s(true, 0n), "fund");
  assert.equal(s(false, STATION_MIN_USDG - 1n), "low");
  assert.equal(s(true, STATION_MIN_USDG - 1n), "low");
  assert.equal(s(false, STATION_MIN_USDG), "make");
  assert.equal(s(true, STATION_MIN_USDG), "pump");
  assert.equal(s(false, 0n, WALLET_GAS_OK_WEI), "ready");
  assert.equal(s(true, 10n ** 6n, WALLET_GAS_OK_WEI), "ready");
  assert.equal(s(true, 10n ** 6n, WALLET_GAS_OK_WEI - 1n), "pump");
});

// ---------------------------------------------------------------- the flag

await test("off unless the flag is exactly on", () => {
  assert.equal(gasStationOn({}), false);
  for (const v of ["", "1", "true", "ON", "yes", "off", "on please"]) assert.equal(gasStationOn({ GLOAM_RELAY_GAS_STATION: v }), false, v);
  assert.equal(gasStationOn({ GLOAM_RELAY_GAS_STATION: "on" }), true);
  assert.equal(gasStationOn({ GLOAM_RELAY_GAS_STATION: " on " }), true);
});

await test("with the flag off the relay refuses before any chain call", async () => {
  off();
  const wallet = freshWallet();
  setWallet(wallet, { stationUsdg: 10n ** 6n });
  forget();
  for (const step of ["make", "pump"]) {
    await assert.rejects(relayGasStation(net, { wallet, step }, IP()), (e: unknown) => {
      isRelayError("station_off", 503)(e);
      assert.equal((e as Error).message, STATION_OFF_MESSAGE);
      return true;
    });
  }
  assert.deepEqual(calls, []);
  assert.equal(sent.length, 0);
});

await test("the status says it's off, and on only for Robinhood Chain mainnet", async () => {
  off();
  assert.ok((await relayStatus()).every((n) => n.gasStation === false));
  on();
  const all = await relayStatus();
  assert.deepEqual(
    all.filter((n) => n.gasStation).map((n) => n.chainId),
    [4663]
  );
});

// ---------------------------------------------------------------- only these two calls

await test("make goes to the factory with the wallet, and to nothing else", async () => {
  on();
  const wallet = freshWallet();
  setWallet(wallet, { stationUsdg: 10n ** 6n });
  forget();
  await relayGasStation(net, { wallet, step: "make" }, IP());
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to.toLowerCase(), GAS_STATION_FACTORY.toLowerCase());
  assert.equal(sent[0]!.value, 0n);
  const d = decodeFunctionData({ abi: gasStationFactoryAbi, data: sent[0]!.data });
  assert.equal(d.functionName, "make");
  assert.deepEqual(d.args, [wallet]);
});

await test("pump goes to that wallet's own station, and to nothing else", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 10n ** 6n });
  forget();
  await relayGasStation(net, { wallet, step: "pump" }, IP());
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to.toLowerCase(), predictStation(wallet).toLowerCase());
  assert.equal(sent[0]!.value, 0n);
  assert.equal(decodeFunctionData({ abi: gasStationAbi, data: sent[0]!.data }).functionName, "pump");
});

await test("a request can't name a target: to, data, value, station and factory are never read", async () => {
  const attacker = "0x9999999999999999999999999999999999999999" as Address;
  const extra = { to: attacker, target: attacker, station: attacker, factory: attacker, data: "0xdeadbeef", value: "1", calldata: "0xdeadbeef" };
  for (const [step, made] of [["make", false], ["pump", true]] as const) {
    const wallet = freshWallet();
    setWallet(wallet, { made, stationUsdg: 10n ** 6n });
    forget();
    await relayGasStation(net, { wallet, step, ...extra }, IP());
    assert.equal(sent.length, 1);
    const wantTo = step === "make" ? GAS_STATION_FACTORY : predictStation(wallet);
    assert.equal(sent[0]!.to.toLowerCase(), wantTo.toLowerCase(), "the target is the relay's own");
    assert.equal(sent[0]!.value, 0n);
    assert.ok(!sent[0]!.data.includes("deadbeef"));
    assert.ok(!sent[0]!.data.toLowerCase().includes(attacker.slice(2).toLowerCase()));
  }
});

await test("only make and pump: every other step is refused before any chain call", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 10n ** 6n });
  forget();
  for (const step of ["release", "pump()", "PUMP", "", undefined, null, 1, ["pump"]]) {
    await assert.rejects(relayGasStation(net, { wallet, step }, IP()), isRelayError("bad_step", 400), String(step));
  }
  assert.deepEqual(calls, []);
});

await test("a malformed wallet is refused, and only Robinhood Chain mainnet is served", async () => {
  forget();
  for (const wallet of ["", "0x12", "not", undefined, 7]) {
    await assert.rejects(relayGasStation(net, { wallet, step: "make" }, IP()), isRelayError("bad_request", 400));
  }
  await assert.rejects(relayGasStation(testnet, { wallet: freshWallet(), step: "make" }, IP()), isRelayError("network", 400));
  assert.deepEqual(calls, []);
});

await test("the wallet passes the same checks as a cash out's address", async () => {
  forget();
  await assert.rejects(relayGasStation(net, { wallet: net.pool, step: "make" }, IP()), isRelayError("vault_recipient", 400));
  await assert.rejects(relayGasStation(net, { wallet: STATION_USDG, step: "make" }, IP()), isRelayError("vault_recipient", 400));
  // on the OFAC list
  await assert.rejects(relayGasStation(net, { wallet: getAddress("0x098b716b8aaf21512996dc57eb0615e2383e2f96"), step: "make" }, IP()), isRelayError("screened", 403));
  assert.equal(sent.length, 0);
});

// ---------------------------------------------------------------- nothing for nothing

await test("no USDG, no gas spent: pump on an empty station would succeed and do nothing", async () => {
  for (const step of ["make", "pump"] as const) {
    for (const stationUsdg of [0n, STATION_MIN_USDG - 1n]) {
      const wallet = freshWallet();
      setWallet(wallet, { made: step === "pump", stationUsdg });
      forget();
      await assert.rejects(relayGasStation(net, { wallet, step }, IP()), isRelayError("no_usdg", 409));
      assert.equal(sent.length, 0);
      assert.equal(simulated.length, 0, "not even a simulation");
    }
  }
});

await test("a wallet that can pay for itself gets nothing from the relay", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 10n ** 6n, walletEth: WALLET_PAYS_OWN_GAS_WEI });
  forget();
  await assert.rejects(relayGasStation(net, { wallet, step: "pump" }, IP()), isRelayError("has_gas", 409));
  assert.equal(sent.length, 0);
  // just under it still gets its pump
  const low = freshWallet();
  setWallet(low, { made: true, stationUsdg: 10n ** 6n, walletEth: WALLET_PAYS_OWN_GAS_WEI - 1n });
  await relayGasStation(net, { wallet: low, step: "pump" }, IP());
  assert.equal(sent.length, 1);
});

await test("each step runs once, in order", async () => {
  const made = freshWallet();
  setWallet(made, { made: true, stationUsdg: 10n ** 6n });
  await assert.rejects(relayGasStation(net, { wallet: made, step: "make" }, IP()), isRelayError("already_made", 409));
  const notYet = freshWallet();
  setWallet(notYet, { made: false, stationUsdg: 10n ** 6n });
  forget();
  await assert.rejects(relayGasStation(net, { wallet: notYet, step: "pump" }, IP()), isRelayError("not_made", 409));
  assert.equal(sent.length, 0);
});

await test("nothing goes out above the gas limit", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { stationUsdg: 10n ** 6n });
  chain.gasPrice = STATION_MAX_GAS_PRICE_WEI + 1n;
  forget();
  await assert.rejects(relayGasStation(net, { wallet, step: "make" }, IP()), isRelayError("gas_high", 503));
  assert.equal(sent.length, 0);
  chain.gasPrice = STATION_MAX_GAS_PRICE_WEI;
  await relayGasStation(net, { wallet, step: "make" }, IP());
  assert.equal(sent.length, 1);
  chain.gasPrice = 20_136_000n;
});

await test("a pump takes at most the cap, and its minimum is a tenth of a percent under the pool's fill", async () => {
  assert.equal(pumpMaxIn(1n), 1n);
  assert.equal(pumpMaxIn(STATION_MAX_PUMP_USDG), STATION_MAX_PUMP_USDG);
  assert.equal(pumpMaxIn(STATION_MAX_PUMP_USDG + 1n), STATION_MAX_PUMP_USDG);
  assert.equal(pumpMinOut(1000n), 999n);

  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 7_000_000n });
  forget();
  await relayGasStation(net, { wallet, step: "pump" }, IP());
  const { args } = decodeFunctionData({ abi: gasStationAbi, data: sent[0]!.data });
  assert.deepEqual(args, [(chain.fill * 999n) / 1000n, STATION_MAX_PUMP_USDG]);

  const small = freshWallet();
  setWallet(small, { made: true, stationUsdg: 400_000n });
  forget();
  await relayGasStation(net, { wallet: small, step: "pump" }, IP());
  assert.deepEqual(decodeFunctionData({ abi: gasStationAbi, data: sent[0]!.data }).args, [(chain.fill * 999n) / 1000n, 400_000n]);
});

await test("a pool that would pay nothing is refused", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 10n ** 6n });
  const fill = chain.fill;
  chain.fill = 0n;
  forget();
  await assert.rejects(relayGasStation(net, { wallet, step: "pump" }, IP()), isRelayError("no_fill", 409));
  assert.equal(sent.length, 0);
  chain.fill = fill;
});

await test("the factory naming another station stops everything", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 10n ** 6n });
  chain.wrongPredict = "0x9999999999999999999999999999999999999999";
  forget();
  await assert.rejects(relayGasStation(net, { wallet, step: "pump" }, IP()), isRelayError("check_failed"));
  assert.equal(sent.length, 0);
  // and the app's own read, before any money moves
  await assert.rejects(
    readStationState(
      {
        readContract: (async (a: { functionName: string }) => (a.functionName === "predict" ? chain.wrongPredict : 0n)) as never,
        getCode: (async () => "0x") as never,
        getBalance: (async () => 0n) as never,
        getTransactionCount: (async () => 0) as never,
      },
      wallet
    ),
    new RegExp(STATION_MISMATCH_MESSAGE)
  );
  chain.wrongPredict = null;
});

await test("the rules, one by one", () => {
  const ok = { made: false, stationUsdg: STATION_MIN_USDG, walletEth: 0n };
  assert.equal(stationRefusal("make", ok), null);
  assert.equal(stationRefusal("pump", { ...ok, made: true }), null);
  // the wallet's gas is checked first, so a funded wallet hears the useful reason
  assert.equal(stationRefusal("make", { ...ok, stationUsdg: 0n, walletEth: WALLET_PAYS_OWN_GAS_WEI })?.code, "has_gas");
  // an empty station is checked before made, so make never runs for nothing
  assert.equal(stationRefusal("make", { ...ok, made: true, stationUsdg: 0n })?.code, "no_usdg");
});

// ---------------------------------------------------------------- spend limits

await test("a wallet gets a few sends a day", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { made: true, stationUsdg: 10n ** 6n });
  forget();
  for (let i = 0; i < STATION_WALLET_DAILY; i++) await relayGasStation(net, { wallet, step: "pump" }, `198.51.101.${i}`);
  assert.equal(sent.length, STATION_WALLET_DAILY);
  await assert.rejects(relayGasStation(net, { wallet, step: "pump" }, "198.51.101.200"), isRelayError("station_wallet_limit", 429));
  assert.equal(sent.length, STATION_WALLET_DAILY);
});

await test("a sender gets a few requests an hour, across wallets", async () => {
  const ip = "198.51.102.7";
  forget();
  for (let i = 0; i < STATION_IP_HOURLY; i++) {
    const wallet = freshWallet();
    setWallet(wallet, { stationUsdg: 10n ** 6n });
    await relayGasStation(net, { wallet, step: "make" }, ip);
  }
  const wallet = freshWallet();
  setWallet(wallet, { stationUsdg: 10n ** 6n });
  const before = sent.length;
  await assert.rejects(relayGasStation(net, { wallet, step: "make" }, ip), isRelayError("rate_limit", 429));
  assert.equal(sent.length, before);
});

await test("the daily budget holds across everyone, and can be set", async () => {
  assert.equal(gasStationDailySends({}), STATION_DAILY_DEFAULT);
  assert.equal(gasStationDailySends({ GLOAM_RELAY_GAS_STATION_DAILY: "5" }), 5);
  for (const v of ["", "0", "-1", "many", "1.5", "9999999"]) assert.equal(gasStationDailySends({ GLOAM_RELAY_GAS_STATION_DAILY: v }), STATION_DAILY_DEFAULT, v);
  assert.equal(gasStationDailySends({ GLOAM_RELAY_GAS_STATION_DAILY: "999999" }), 1_000, "capped");

  // this run has already spent some of the day's budget
  process.env.GLOAM_RELAY_GAS_STATION_DAILY = "1";
  const wallet = freshWallet();
  setWallet(wallet, { stationUsdg: 10n ** 6n });
  forget();
  await assert.rejects(relayGasStation(net, { wallet, step: "make" }, "198.51.103.1"), isRelayError("station_busy", 429));
  assert.equal(sent.length, 0);
  delete process.env.GLOAM_RELAY_GAS_STATION_DAILY;
});

// ---------------------------------------------------------------- the route and the client

await test("the route takes gas-station, and passes back a refusal with its code", async () => {
  const wallet = freshWallet();
  setWallet(wallet, { stationUsdg: 0n });
  const res = await relayPost(
    new Request("http://local/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.104.1" },
      body: JSON.stringify({ chainId: 4663, action: "gas-station", wallet, step: "make" }),
    })
  );
  assert.equal(res.status, 409);
  const json = (await res.json()) as { ok: boolean; code: string };
  assert.equal(json.ok, false);
  assert.equal(json.code, "no_usdg");
});

await test("the route is off with the flag off", async () => {
  off();
  const res = await relayPost(
    new Request("http://local/api/relay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.104.2" },
      body: JSON.stringify({ chainId: 4663, action: "gas-station", wallet: freshWallet(), step: "make" }),
    })
  );
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { code: string }).code, "station_off");
  on();
});

await test("the app sends the chain, the wallet and the step, and nothing else", async () => {
  const wallet = freshWallet();
  const seen: string[] = [];
  const stub = globalThis.fetch;
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    seen.push(String(init?.body));
    return new Response(JSON.stringify({ ok: true, hash: "0x" + "ab".repeat(32) }), { status: 200 });
  }) as typeof fetch;
  try {
    await clientGasStation({ chainId: 4663, wallet, step: "pump" });
  } finally {
    globalThis.fetch = stub;
  }
  assert.deepEqual(JSON.parse(seen[0]!), { action: "gas-station", chainId: 4663, wallet, step: "pump" });
});

globalThis.fetch = realFetch;
console.log(`\n${passed} passed`);
process.exit(0);
