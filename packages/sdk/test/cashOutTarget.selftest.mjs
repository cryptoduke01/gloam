/**
 * Cash-out recipient self-test (cashOutTargetProblem).
 *
 * The app and the relay refuse a cash out to an address where the money would be stuck (#124); the SDK, which the
 * GAME plugin and any self-custodial agent build with, now refuses the same addresses: the vault, the zero address,
 * the network's memo board, a listed asset contract and Gloam's swap routers. Matching is per chain, so one address
 * can be a router on one network and an ordinary recipient on another.
 *
 * Run after build:  node test/cashOutTarget.selftest.mjs
 */
import {
  cashOutTargetProblem,
  GLOAM_SWAP_ROUTERS,
  RH_MAINNET_CHAIN_ID,
  RH_MAINNET_USDG,
} from "../dist/index.js";

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

const zero = "0x0000000000000000000000000000000000000000";
const someone = "0x00000000000000000000000000000000C0FFEE01";
const pool = "0x1111111111111111111111111111111111111111";
const [v4, v4b] = GLOAM_SWAP_ROUTERS[RH_MAINNET_CHAIN_ID];

check("the vault is refused", cashOutTargetProblem(pool, RH_MAINNET_CHAIN_ID, pool) !== null);
check("the zero address is refused", cashOutTargetProblem(zero, RH_MAINNET_CHAIN_ID, pool) !== null);
check("USDG's own contract is refused", cashOutTargetProblem(RH_MAINNET_USDG, RH_MAINNET_CHAIN_ID, pool) !== null);
check("the V4 router is refused", cashOutTargetProblem(v4, RH_MAINNET_CHAIN_ID, pool) !== null);
check("the V4b router is refused, in any case", cashOutTargetProblem(v4b.toLowerCase(), RH_MAINNET_CHAIN_ID, pool) !== null);
check("an ordinary address is accepted", cashOutTargetProblem(someone, RH_MAINNET_CHAIN_ID, pool) === null);
check("a router address is an ordinary recipient on a chain where it is nothing", cashOutTargetProblem(v4, 1, pool) === null);

console.log(`cashOutTarget selftest: ${checks} checks passed`);
