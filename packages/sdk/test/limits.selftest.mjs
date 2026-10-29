/**
 * Live beta deposit limits self-test.
 *
 * The vault's limits change through its timelock (the 100x raise queued for
 * 1 November), so the SDK reads them from the vault: depositLimitsOn(),
 * depositLimit(asset) and deposited(asset). A deposit over the old 500 launch
 * value goes through once the vault says so; one over the vault's live limit or
 * its room left is refused before proving; a vault that can't be read refuses
 * nothing (the vault enforces its own limits). Reads go to an in-memory fake.
 *
 * Run after build:  node test/limits.selftest.mjs
 */
import {
  readDepositLimit,
  depositLimitProblem,
  assertDepositWithinLiveLimit,
  buildShieldBoundIntent,
  POOL_DEPOSIT_LIMIT_ABI,
  MAINNET_POOLS,
  RH_MAINNET_USDG,
  NATIVE_ASSET,
} from "../dist/index.js";

let checks = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  checks++;
}
async function rejects(fn, re, msg) {
  try {
    await fn();
  } catch (e) {
    assert(re.test(String(e?.message ?? e)), `${msg}: wrong error "${e?.message}"`);
    return;
  }
  assert(false, `${msg}: did not throw`);
}

const SIX = 10n ** 6n;
const RH = 4663;
const POOL = MAINNET_POOLS[RH].pool;

/** A vault answering depositLimitsOn / depositLimit / deposited from `state`; records what it was asked. */
function fakeVault(state) {
  const asked = [];
  return {
    asked,
    readContract: async ({ address, abi, functionName, args }) => {
      asked.push({ address, functionName, args });
      assert(abi === POOL_DEPOSIT_LIMIT_ABI, "reads use the SDK's ABI");
      if (state.down) throw new Error("HTTP request failed. Status: 503");
      if (functionName === "depositLimitsOn") return state.on;
      const a = String(args[0]).toLowerCase();
      if (functionName === "depositLimit") return state.limits[a] ?? [0n, 0n];
      if (functionName === "deposited") return state.deposited?.[a] ?? 0n;
      throw new Error(`unexpected read ${functionName}`);
    },
  };
}
const usdg = RH_MAINNET_USDG.toLowerCase();
const prover = async () => ({ proofBytes: "0xdeadbeef" });
let proved = 0;
const countingProver = async (i) => {
  proved++;
  return prover(i);
};

// launch values: 500 per deposit, 25,000 in total
const launch = { on: true, limits: { [usdg]: [500n * SIX, 25_000n * SIX] }, deposited: { [usdg]: 1_000n * SIX } };
// after the raise: 100x
const raised = { on: true, limits: { [usdg]: [50_000n * SIX, 2_500_000n * SIX] }, deposited: { [usdg]: 1_000n * SIX } };

// ── reading ──────────────────────────────────────────────────────────────────
{
  const v = fakeVault(raised);
  const lim = await readDepositLimit(v, POOL, RH_MAINNET_USDG);
  assert(lim.on && lim.perDeposit === 50_000n * SIX && lim.total === 2_500_000n * SIX, "reads the vault's own limits");
  assert(lim.deposited === 1_000n * SIX && lim.room === 2_499_000n * SIX, "and what it holds, and the room left");
  assert(v.asked.every((q) => q.address === POOL), "every read goes to the vault");
}

// ── the raise: 501 goes through once the vault says so ───────────────────────
{
  await rejects(
    () => assertDepositWithinLiveLimit(fakeVault(launch), RH, RH_MAINNET_USDG, 501n * SIX),
    /at most 500 USDG per deposit/,
    "before the raise, 501 is over the vault's limit"
  );
  const after = await assertDepositWithinLiveLimit(fakeVault(raised), RH, RH_MAINNET_USDG, 501n * SIX);
  assert(after && after.perDeposit === 50_000n * SIX, "after the raise, 501 is taken");
  const i = await buildShieldBoundIntent({ chainId: RH, asset: RH_MAINNET_USDG, amountWei: 10_000n * SIX, prover, client: fakeVault(raised) });
  assert(i.exec.fn === "shieldBound" && i.exec.args[1] === 10_000n * SIX, "the builder makes a 10,000 deposit after the raise");
}

// ── refused before any proof is made ────────────────────────────────────────
{
  proved = 0;
  await rejects(
    () => buildShieldBoundIntent({ chainId: RH, asset: RH_MAINNET_USDG, amountWei: 50_001n * SIX, prover: countingProver, client: fakeVault(raised) }),
    /at most 50,000 USDG per deposit/,
    "over the live per-deposit limit"
  );
  const full = { ...raised, deposited: { [usdg]: 2_499_990n * SIX } };
  await rejects(
    () => buildShieldBoundIntent({ chainId: RH, asset: RH_MAINNET_USDG, amountWei: 11n * SIX, prover: countingProver, client: fakeVault(full) }),
    /room for 10 more USDG/,
    "over the room left under the total"
  );
  const atCap = { ...raised, deposited: { [usdg]: 2_500_000n * SIX } };
  await rejects(
    () => assertDepositWithinLiveLimit(fakeVault(atCap), RH, RH_MAINNET_USDG, 1n),
    /full for USDG/,
    "a full vault"
  );
  assert(proved === 0, "nothing was proved for a refused deposit");
}

// ── limits off, an unlisted asset, a vault that can't be read ────────────────
{
  const off = await assertDepositWithinLiveLimit(fakeVault({ on: false, limits: {} }), RH, RH_MAINNET_USDG, 10n ** 30n);
  assert(off && !off.on, "limits off: any amount");
  await rejects(
    () => assertDepositWithinLiveLimit(fakeVault(raised), RH, NATIVE_ASSET, 1n),
    /takes no ETH deposits/,
    "an asset with no limit is one the vault takes none of"
  );
  const down = await assertDepositWithinLiveLimit(fakeVault({ down: true }), RH, RH_MAINNET_USDG, 10n ** 30n);
  assert(down === null, "a vault that can't be read refuses nothing here");
  // and the builder still makes the deposit (the vault enforces its own limits), with the listing still checked
  const i = await buildShieldBoundIntent({ chainId: RH, asset: RH_MAINNET_USDG, amountWei: 600n * SIX, prover, client: fakeVault({ down: true }) });
  assert(i.exec.args[1] === 600n * SIX, "a deposit over the launch value is not blocked when the read fails");
  await rejects(
    () => buildShieldBoundIntent({ chainId: RH, asset: "0x00000000000000000000000000000000000000bb", amountWei: 1n, prover, client: fakeVault({ down: true }) }),
    /does not list/,
    "with no live answer, an unlisted asset is still refused"
  );
  // without a client the amount is not checked here at all
  const j = await buildShieldBoundIntent({ chainId: RH, asset: RH_MAINNET_USDG, amountWei: 5_000n * SIX, prover });
  assert(j.exec.args[1] === 5_000n * SIX, "no client: the launch value no longer refuses");
  assert(depositLimitProblem({ on: true, perDeposit: 5n, total: 10n, deposited: 0n, room: 10n }, 5n, "X", "T", 0) === null, "exactly the limit is fine");
}

console.log(`limits.selftest: ok (${checks} assertions)`);
process.exit(0);
