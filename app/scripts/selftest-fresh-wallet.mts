/**
 * Self-test: fund a fresh wallet from the private balance (lib/freshWallet).
 *
 *  - which addresses can be the fresh wallet: never the signed-in wallet, one
 *    this browser deposited from, or anywhere a cash out would be stuck
 *  - the two pieces: gas first, the vault's own fee read live, Max leaving room
 *    for gas
 *  - the real private cash-out runner with fake money paths: order, targets,
 *    scheduled or sent now, the station confirmed before anything moves, and a
 *    run that stops part way
 *  - sending now: a note is marked spent only once its receipt says so
 *  - gas: make then pump, picking up from the chain, the relay's node running a
 *    moment behind, and no relay call at all when nothing is needed
 *  - the fill-in link and the link back
 *  - the wording rules, on every file a reader sees
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-fresh-wallet.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./browser-shim.mjs";
import type { Address, Hex } from "viem";

const {
  FRESH_MAX_GAS,
  FRESH_MIN_GAS,
  FRESH_MIN_USDG,
  GAS_REVERTED,
  SEND_REVERTED,
  SEND_SLOW,
  amountProblem,
  backLink,
  freshAddressProblem,
  fundFreshWallet,
  fundLink,
  fundingPlan,
  gasProblem,
  getGas,
  mostForWallet,
  pieceWords,
  readFundLink,
  sendPieceNow,
} = await import("../src/lib/freshWallet");
const { FRESH_WALLET_PATH, GAS_STATION_CHAIN_ID, STATION_MIN_USDG, STATION_MISMATCH_MESSAGE, STATION_USDG, WALLET_GAS_OK_WEI, predictStation } = await import("../src/lib/gasStation");
const { runPrivateCashOut } = await import("../src/lib/cashOutPrivately");
const { RelaySubmitError } = await import("../src/lib/relay/client");
const { readPaymentRequest } = await import("../src/lib/paymentRequest");
const { withdrawFeeOf } = await import("../src/lib/shield");
const { getNetwork } = await import("../src/lib/networks");
type LocalNote = import("../src/lib/shield").LocalNote;
type StationState = import("../src/lib/gasStation").StationState;
type CashOutCall = import("../src/lib/cashOutProof").CashOutCall;
type SplitArgs = import("../src/lib/cashOutSplit").SplitArgs;
type FundWhen = import("../src/lib/freshWallet").FundWhen;

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
}

const U = 1_000_000n;
const net = getNetwork("robinhood-mainnet");
const WALLET = "0x1111111111111111111111111111111111111b0b" as Address;
const STATION = predictStation(WALLET);
const OWNER = "0x2222222222222222222222222222222222222222" as Address;
const HASH = ("0x" + "ab".repeat(32)) as Hex;

// ---------------------------------------------------------------- the address

const addressProblem = (to: string, connected: string | null = OWNER, deposited: string[] = []) =>
  freshAddressProblem({ to, connected, deposited: new Set(deposited), targetProblem: (t) => (t === STATION_USDG ? "Not a token." : null) });

await test("a fresh wallet can't be the signed-in wallet, or one this browser deposited from", () => {
  assert.equal(addressProblem(""), null, "empty is not a problem yet");
  assert.equal(addressProblem(WALLET), null);
  assert.equal(addressProblem(WALLET, null), null, "nobody signed in");
  assert.match(addressProblem("nonsense")!, /0x address/);
  assert.match(addressProblem(OWNER)!, /signed in/);
  assert.match(addressProblem(`  ${OWNER.toUpperCase().replace("0X", "0x")}  `)!, /signed in/, "whatever the case or spacing");
  assert.match(addressProblem(WALLET, OWNER, [WALLET.toLowerCase()])!, /added money/);
  assert.equal(addressProblem(STATION_USDG), "Not a token.", "the cash-out rules apply");
});

await test("amounts: at least 0.5 USDG to the wallet, 0.5 to 5 for gas", () => {
  assert.equal(amountProblem(null, ""), null);
  assert.match(amountProblem(null, "abc")!, /Enter/);
  assert.match(amountProblem(FRESH_MIN_USDG - 1n, "0.4")!, /at least/);
  assert.equal(amountProblem(FRESH_MIN_USDG, "0.5"), null);
  assert.match(gasProblem(null, "")!, /Enter/);
  assert.match(gasProblem(FRESH_MIN_GAS - 1n, "0.4")!, /0\.5 to 5/);
  assert.match(gasProblem(FRESH_MAX_GAS + 1n, "6")!, /0\.5 to 5/);
  assert.equal(gasProblem(FRESH_MIN_GAS, "0.5"), null);
  assert.equal(gasProblem(FRESH_MAX_GAS, "5"), null);
});

await test("the least gas money still clears what the relay acts on, even at a much higher fee", () => {
  for (const bps of [0, 25, 50, 100, 500]) assert.ok(FRESH_MIN_GAS - withdrawFeeOf(FRESH_MIN_GAS, bps) >= STATION_MIN_USDG, `at ${bps} bps`);
});

// ---------------------------------------------------------------- the plan

await test("gas goes first, to the wallet's own station, and the fee is the vault's", () => {
  for (const bps of [0, 25, 50]) {
    const p = fundingPlan({ wallet: WALLET, amount: 100n * U, gas: U, feeBps: bps });
    assert.deepEqual(p.pieces, [U, 100n * U]);
    assert.deepEqual(p.to, [STATION, WALLET]);
    assert.equal(p.total, 101n * U);
    assert.equal(p.fee, withdrawFeeOf(U, bps) + withdrawFeeOf(100n * U, bps));
    assert.equal(p.arrives.station + p.arrives.wallet + p.fee, p.total, "every unit accounted for");
  }
});

await test("Max leaves room for gas, and nothing is offered when gas doesn't fit", () => {
  assert.equal(mostForWallet(10n * U, U), 9n * U);
  assert.equal(mostForWallet(U, U), 0n);
  assert.equal(mostForWallet(U, 2n * U), 0n);
  assert.equal(mostForWallet(10n * U, null), 0n, "no gas amount yet");
});

// ---------------------------------------------------------------- funding

const note = (over: Partial<LocalNote> = {}): LocalNote =>
  ({
    id: "n1",
    amountWei: String(20n * U),
    asset: STATION_USDG,
    commitment: "0x" + "01".repeat(32),
    secret: "0x" + "02".repeat(32),
    nullifier: "0x" + "03".repeat(32),
    chainId: GAS_STATION_CHAIN_ID,
    pool: net.pool,
    bound: true,
    scheme: "poseidon",
    from: OWNER,
    createdAt: 1,
    status: "open",
    source: "local",
    leafIndex: 1,
    ...over,
  }) as LocalNote;

const stateOf = (over: Partial<StationState> = {}): StationState => ({
  wallet: WALLET,
  station: STATION,
  made: false,
  stationUsdg: 0n,
  walletUsdg: 0n,
  walletEth: 0n,
  walletTxs: 0,
  ...over,
});

/** The real runner, with the steps that touch the chain or the relay swapped for fakes that keep a log. */
function fakeRun(log: string[], stopAt?: number) {
  let made = 0;
  const run: typeof runPrivateCashOut = (a) =>
    runPrivateCashOut({
      ...a,
      deps: {
        pathOf: async () => ({}) as never,
        split: async (s: SplitArgs) => {
          made++;
          log.push(`split ${s.amount}`);
          const part = note({ id: `part-${made}`, amountWei: String(s.amount) });
          const rest = BigInt(s.note.amountWei) - s.amount;
          return { part, change: rest > 0n ? note({ id: `change-${made}`, amountWei: String(rest) }) : null };
        },
        prove: async (n: LocalNote, to: Address) => {
          log.push(`prove ${to}`);
          return { chainId: GAS_STATION_CHAIN_ID, proof: "0x", root: "0x", nullifier: "0x", asset: STATION_USDG, to, amount: BigInt(n.amountWei) } as CashOutCall;
        },
        schedule: async (_n: LocalNote, call: CashOutCall, when: unknown) => {
          log.push(`schedule ${call.to} ${String(when)}`);
          if (stopAt !== undefined && log.filter((l) => l.startsWith("schedule") || l.startsWith("now")).length > stopAt) throw new Error("relay down");
          return { id: "job", chainId: GAS_STATION_CHAIN_ID, sendAfter: 1, status: "scheduled", updatedAt: 1, to: call.to };
        },
        newId: () => "plan",
        ...a.deps,
      },
    });
  return run;
}

const fund = (when: FundWhen, log: string[], over: { note?: LocalNote; read?: () => Promise<StationState>; stopAt?: number } = {}) =>
  fundFreshWallet({
    note: over.note ?? note(),
    wallet: WALLET,
    amount: 10n * U,
    gas: U,
    feeBps: 25,
    when,
    owner: OWNER,
    deps: {
      read: over.read ?? (async () => (log.push("confirm station"), stateOf())),
      run: fakeRun(log, over.stopAt),
      sendNow: async (_n, call) => {
        log.push(`now ${call.to}`);
        return { id: "h", chainId: call.chainId, sendAfter: 1, status: "sent", updatedAt: 1, to: call.to };
      },
    },
  });

await test("scheduled: the station is confirmed, then gas, then USDG, each in the window chosen", async () => {
  const log: string[] = [];
  const r = await fund("6h", log);
  assert.equal(r.stoppedAt, null);
  assert.equal(r.jobs.length, 2);
  assert.deepEqual(log, [
    "confirm station",
    `split ${U}`,
    `prove ${STATION}`,
    `schedule ${STATION} 6h`,
    `split ${10n * U}`,
    `prove ${WALLET}`,
    `schedule ${WALLET} 6h`,
  ]);
});

await test("now: the same steps, sent instead of scheduled", async () => {
  const log: string[] = [];
  const r = await fund("now", log);
  assert.equal(r.stoppedAt, null);
  assert.deepEqual(log.filter((l) => l.startsWith("now") || l.startsWith("schedule")), [`now ${STATION}`, `now ${WALLET}`]);
});

await test("a station the factory doesn't confirm stops the run before anything moves", async () => {
  const log: string[] = [];
  await assert.rejects(
    fund("now", log, {
      read: async () => {
        throw new Error(STATION_MISMATCH_MESSAGE);
      },
    }),
    new RegExp(STATION_MISMATCH_MESSAGE)
  );
  assert.deepEqual(log, []);
});

await test("only a USDG note on Robinhood Chain mainnet", async () => {
  const log: string[] = [];
  await assert.rejects(fund("now", log, { note: note({ chainId: 46630 }) }), /Robinhood Chain mainnet/);
  await assert.rejects(fund("now", log, { note: note({ asset: "0x3333333333333333333333333333333333333333" }) }), /USDG/);
  assert.deepEqual(log, []);
});

await test("a run that stops says where, and the USDG never goes without its gas", async () => {
  const log: string[] = [];
  const r = await fund("hour", log, { stopAt: 0 });
  assert.equal(r.stoppedAt, 0);
  assert.equal(r.jobs.length, 0);
  assert.equal(r.error, "relay down");
  assert.ok(!log.some((l) => l.includes(WALLET)), "the wallet's piece never started");
});

await test("a plan bigger than the note is refused before anything moves", async () => {
  const log: string[] = [];
  await assert.rejects(fund("now", log, { note: note({ amountWei: String(5n * U) }) }), /more than this balance/);
  assert.ok(!log.some((l) => l.startsWith("split")));
});

await test("the whole note works too: the second piece is the first split's change", async () => {
  const log: string[] = [];
  const r = await fund("hour", log, { note: note({ amountWei: String(11n * U) }) });
  assert.equal(r.stoppedAt, null);
  assert.equal(log.filter((l) => l.startsWith("split")).length, 1);
  assert.deepEqual(log.filter((l) => l.startsWith("prove")), [`prove ${STATION}`, `prove ${WALLET}`]);
});

await test("the runner's words name the two pieces, and say sending when it sends", () => {
  assert.equal(pieceWords("Piece 1 of 2: proving privately…", "hour"), "Gas money: proving privately…");
  assert.equal(pieceWords("Piece 2 of 2: scheduling with the Gloam relay…", "hour"), "Your USDG: scheduling with the Gloam relay…");
  assert.equal(pieceWords("Piece 2 of 2: scheduling with the Gloam relay…", "now"), "Your USDG: sending through the Gloam relay…");
});

// ---------------------------------------------------------------- sending now

const CALL: CashOutCall = { chainId: GAS_STATION_CHAIN_ID, proof: "0x", root: "0x", nullifier: "0x", asset: STATION_USDG, to: WALLET, amount: U };

await test("sent now: the note is marked spent once the receipt says so, not before", async () => {
  const log: string[] = [];
  const job = await sendPieceNow(note(), CALL, {
    send: async () => (log.push("send"), HASH),
    wait: async () => (log.push("wait"), "success"),
    settle: (id, hash) => log.push(`settle ${id} ${hash}`),
    now: () => 7,
  });
  assert.deepEqual(log, ["send", "wait", `settle n1 ${HASH}`]);
  assert.equal(job.status, "sent");
  assert.equal(job.hash, HASH);
  assert.equal(job.to, WALLET);
});

await test("a reverted send, a slow one or a refused one leaves the note alone", async () => {
  const settled: string[] = [];
  const deps = { send: async () => HASH, settle: (id: string) => void settled.push(id), now: () => 1 };
  await assert.rejects(sendPieceNow(note(), CALL, { ...deps, wait: async () => "reverted" }), new RegExp(SEND_REVERTED));
  await assert.rejects(
    sendPieceNow(note(), CALL, {
      ...deps,
      wait: async () => {
        throw new Error("timeout");
      },
    }),
    new RegExp(SEND_SLOW)
  );
  await assert.rejects(
    sendPieceNow(note(), CALL, {
      ...deps,
      send: async () => {
        throw new RelaySubmitError("The relay is off.", "relay_off");
      },
      wait: async () => "success",
    }),
    /relay is off/
  );
  assert.deepEqual(settled, []);
});

// ---------------------------------------------------------------- gas

function gasDeps(states: Partial<StationState>[], over: { send?: (step: string) => Promise<Hex>; wait?: () => Promise<"success" | "reverted"> } = {}) {
  const sent: string[] = [];
  const slept: number[] = [];
  let i = 0;
  return {
    sent,
    slept,
    deps: {
      read: async () => stateOf(states[Math.min(i++, states.length - 1)]),
      send: async (p: { chainId: number; wallet: Address; step: "make" | "pump" }) => {
        assert.equal(p.chainId, GAS_STATION_CHAIN_ID);
        assert.equal(p.wallet, WALLET);
        sent.push(p.step);
        return over.send ? over.send(p.step) : HASH;
      },
      wait: over.wait ?? (async () => "success" as const),
      sleep: async (ms: number) => void slept.push(ms),
    },
  };
}

const funded = { stationUsdg: U };
const made = { stationUsdg: U, made: true };
const gassed = { made: true, walletEth: WALLET_GAS_OK_WEI * 20n };

await test("gas: make, then pump, and the wallet ends with ETH", async () => {
  const d = gasDeps([funded, made, gassed]);
  const s = await getGas({ wallet: WALLET, deps: d.deps });
  assert.deepEqual(d.sent, ["make", "pump"]);
  assert.equal(s.walletEth, WALLET_GAS_OK_WEI * 20n);
});

await test("gas picks up where it was left: a made station only needs its pump", async () => {
  const d = gasDeps([made, gassed]);
  await getGas({ wallet: WALLET, deps: d.deps });
  assert.deepEqual(d.sent, ["pump"]);
});

await test("gas asks the relay for nothing when nothing is needed", async () => {
  for (const s of [{}, { stationUsdg: STATION_MIN_USDG - 1n }, gassed]) {
    const d = gasDeps([s]);
    await getGas({ wallet: WALLET, deps: d.deps });
    assert.deepEqual(d.sent, []);
  }
});

await test("the chain a moment behind after a make: gas waits for it to show", async () => {
  const d = gasDeps([funded, funded, funded, made, gassed]);
  await getGas({ wallet: WALLET, deps: d.deps });
  assert.deepEqual(d.sent, ["make", "pump"], "no second make");
  assert.ok(d.slept.length >= 2);
});

await test("the relay's node a moment behind: not_made is tried again, then given up on", async () => {
  let tries = 0;
  const ok = gasDeps([made, gassed], {
    send: async () => {
      if (++tries < 3) throw new RelaySubmitError("This station isn't made yet.", "not_made");
      return HASH;
    },
  });
  await getGas({ wallet: WALLET, deps: ok.deps });
  assert.equal(tries, 3);

  const never = gasDeps([made], {
    send: async () => {
      throw new RelaySubmitError("This station isn't made yet.", "not_made");
    },
  });
  await assert.rejects(getGas({ wallet: WALLET, deps: never.deps }), /isn't made yet/);
  assert.equal(never.sent.length, 4);
});

await test("any other refusal stops at once, and a revert says the USDG stays put", async () => {
  const refused = gasDeps([funded], {
    send: async () => {
      throw new RelaySubmitError("Today's limit.", "station_busy");
    },
  });
  await assert.rejects(getGas({ wallet: WALLET, deps: refused.deps }), /Today's limit/);
  assert.equal(refused.sent.length, 1);

  const reverted = gasDeps([funded], { wait: async () => "reverted" });
  await assert.rejects(getGas({ wallet: WALLET, deps: reverted.deps }), new RegExp(GAS_REVERTED));
  assert.deepEqual(reverted.sent, ["make"], "no pump after a failed make");
});

// ---------------------------------------------------------------- links

await test("the fill-in link keeps everything in the fragment", () => {
  const url = fundLink(WALLET, "25");
  assert.equal(url, `https://gloam.trade${FRESH_WALLET_PATH}#to=${WALLET}&amount=25`);
  assert.equal(new URL(url).search, "", "nothing a server would see");
  assert.deepEqual(readFundLink(new URL(url).hash), { to: WALLET, amount: "25" });
  assert.deepEqual(readFundLink(new URL(fundLink(WALLET)).hash), { to: WALLET, amount: "" });
});

await test("a malformed link fills in nothing", () => {
  assert.deepEqual(readFundLink(""), { to: "", amount: "" });
  assert.deepEqual(readFundLink("#to=nonsense&amount=-5"), { to: "", amount: "" });
  assert.deepEqual(readFundLink("#amount=1e9"), { to: "", amount: "" });
  assert.deepEqual(readFundLink("#amount=1.1234567"), { to: "", amount: "" });
  assert.deepEqual(readFundLink("#claim=gloam1=abc"), { to: "", amount: "" });
});

await test("the link back is a USDG request on Robinhood Chain mainnet, to your own Gloam address", () => {
  const tag = "gloamr1." + "a".repeat(120);
  const url = new URL(backLink(tag));
  assert.equal(url.origin, "https://gloam.trade");
  const fragment = new URLSearchParams(url.hash.slice(1));
  assert.equal(fragment.get("to"), tag);
  assert.equal(fragment.get("chain"), "robinhood-mainnet");
  assert.equal(fragment.get("asset")?.toLowerCase(), STATION_USDG.toLowerCase());
  assert.equal(fragment.get("amount"), null, "the payer picks the amount");
  assert.ok(readPaymentRequest(fragment, "robinhood-mainnet"));
});

// ---------------------------------------------------------------- wording

await test("the wording rules, on everything a reader sees", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  // what the person reads: the strings and JSX text, not the file's comments for the next engineer
  const prose = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const files = {
    docs: prose(read("../src/app/docs/fresh-wallet/page.tsx")),
    view: prose(read("../src/components/app/FreshWalletView.tsx")),
    flow: prose(read("../src/lib/freshWallet.ts")),
    page: prose(read("../src/app/app/fresh-wallet/page.tsx")),
    rules: prose(read("../src/lib/relay/gasStation.ts")),
    search: read("../src/components/docs/DocsSearch.tsx").match(/"\/docs\/fresh-wallet": \{[\s\S]*?\n {2}\},/)![0],
  };
  const banned: [RegExp, string][] = [
    [/anonym/i, "anonymous"],
    [/untraceable/i, "untraceable"],
    [/audit/i, "audited"],
    [/partner/i, "partnered"],
    [/endors/i, "endorsed"],
    [/reward|incentive|earn points/i, "rewards"],
    [/—/, "an em dash"],
    [/private (short|position|loan|trade|trading)/i, "a private position"],
    [/position is private|positions? stays? private|hides? (the|your) position/i, "a private position"],
    [/0\.25%|0\.5%/, "a fee percentage (PR #162 owns that copy)"],
    [/real money|play money|test money/i, "a network gloss"],
  ];
  for (const [name, text] of Object.entries(files)) {
    for (const [re, what] of banned) assert.ok(!re.test(text), `${name} says ${what}: ${text.match(re)?.[0]}`);
  }
  assert.match(files.docs, /doesn(&apos;|')t point to your main wallet/);
  assert.match(files.docs, /position is public/i);
  assert.match(files.docs, /normal cash-out fee/);
  assert.match(files.docs, /can still link/i);
  assert.match(files.view, /Amounts and timing can still link wallets/);
});

console.log(`\n${passed} passed`);
process.exit(0);
