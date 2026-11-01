/**
 * Borro's gas station on Robinhood Chain, the part that only reads and counts.
 *
 * A fresh wallet funded from a private balance has USDG and no ETH, and topping
 * it up from the main wallet would link the two. A gas station fixes that: the
 * factory makes one per wallet, at an address known before it exists, and it
 * swaps the USDG it holds for ETH and sends that ETH to its one wallet.
 *
 * What the code on chain does (read from the deployed bytecode and run on a
 * local fork; the factory's source is not public):
 *  - make(wallet) can be called by anyone. It deploys a clone with the wallet
 *    written into its code, emits one event, and does nothing the second time.
 *  - USDG sent to the address before make() stays there and survives make().
 *  - pump(minOut, maxIn) can be called by anyone. It swaps up to maxIn in the
 *    WETH/USDG pool, at no less than minOut or the station's own floor of 1%
 *    under Chainlink, whichever is higher, and pays the ETH to the wallet.
 *  - pump on an empty station succeeds, returns 0 and does nothing. The relay's
 *    dry run can't catch that, so stationRefusal checks the balance itself.
 *  - The wallet comes from the clone's code, never from a caller: a station can
 *    only pay its own wallet.
 *
 * predictStation works the address out here, from the factory's CREATE2 inputs,
 * so the relay never reads or accepts a target. readStationState also asks the
 * factory, and refuses to go on if the two differ: money sent to a wrong address
 * could not be got back.
 */
import { concatHex, getContractAddress, isAddressEqual, keccak256, padHex, type Address, type Hex, type PublicClient } from "viem";

/** Where the flow lives, here so a docs page (a server component) can use it. */
export const FRESH_WALLET_PATH = "/app/fresh-wallet";
export const BORRO_URL = "https://borro.markets";

export const GAS_STATION_CHAIN_ID = 4663;
export const GAS_STATION_FACTORY: Address = "0x15CDacF97CFfe8024Ee8449385Ed421f5661C2E2";
export const GAS_STATION_IMPLEMENTATION: Address = "0xC375ACC52d1F44a061072d2B120723CF3710ABa6";
/** USDG on Robinhood Chain mainnet, the only token a station swaps. */
export const STATION_USDG: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** The least USDG at a station the relay spends gas on, so nobody can make it work for free. */
export const STATION_MIN_USDG = 250_000n;
/** The most USDG one relayed pump swaps. A station is for gas, not spending money. */
export const STATION_MAX_PUMP_USDG = 5_000_000n;
/**
 * ETH that counts as ready for Borro: 2.5 million gas at 0.02 gwei. Real shorts
 * on Borro took up to 1.4 million gas to open and 0.6 million to close, so this
 * covers one of each and the approval before it.
 */
export const WALLET_GAS_OK_WEI = 50_000_000_000_000n;
/** A wallet holding this much pays for its own pump: the relay leaves it alone. */
export const WALLET_PAYS_OWN_GAS_WEI = 200_000_000_000_000n;

export const gasStationFactoryAbi = [
  { type: "function", name: "make", stateMutability: "nonpayable", inputs: [{ name: "wallet", type: "address" }], outputs: [{ name: "station", type: "address" }] },
  { type: "function", name: "predict", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ name: "station", type: "address" }] },
] as const;

/** Only the two-argument pump: the relay always names its limits. */
export const gasStationAbi = [
  {
    type: "function",
    name: "pump",
    stateMutability: "nonpayable",
    inputs: [
      { name: "minOut", type: "uint256" },
      { name: "maxIn", type: "uint256" },
    ],
    outputs: [{ name: "ethOut", type: "uint256" }],
  },
] as const;

const erc20BalanceAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

/** The clone the factory deploys for `wallet`: EIP-1167 with the wallet appended, 0x41 bytes of code. */
function stationInitCode(wallet: Address): Hex {
  return concatHex([
    "0x6100413d81600a3d39f3",
    "0x363d3d373d3d3d363d73",
    GAS_STATION_IMPLEMENTATION,
    "0x5af43d82803e903d91602b57fd5bf3",
    wallet,
  ]);
}

/** The station's address for `wallet`, whether or not it exists yet. */
export function predictStation(wallet: Address): Address {
  return getContractAddress({
    opcode: "CREATE2",
    from: GAS_STATION_FACTORY,
    salt: padHex("0x00", { size: 32 }),
    bytecodeHash: keccak256(stationInitCode(wallet)),
  });
}

export type StationState = {
  wallet: Address;
  station: Address;
  /** The station has been made: it has code. */
  made: boolean;
  stationUsdg: bigint;
  walletUsdg: bigint;
  walletEth: bigint;
  /** Transactions the wallet has sent: above 0 it is not as fresh as it looks. */
  walletTxs: number;
};

export type StationReader = Pick<PublicClient, "readContract" | "getCode" | "getBalance" | "getTransactionCount">;

export const STATION_MISMATCH_MESSAGE = "This wallet's gas station could not be confirmed, so nothing was sent. Try again shortly.";

/** Reads a wallet and its station. Throws when the factory names any other station than predictStation does. */
export async function readStationState(client: StationReader, wallet: Address): Promise<StationState> {
  const station = predictStation(wallet);
  const balanceOf = (account: Address) =>
    client.readContract({ address: STATION_USDG, abi: erc20BalanceAbi, functionName: "balanceOf", args: [account] });
  const [onChain, code, stationUsdg, walletUsdg, walletEth, walletTxs] = await Promise.all([
    client.readContract({ address: GAS_STATION_FACTORY, abi: gasStationFactoryAbi, functionName: "predict", args: [wallet] }),
    client.getCode({ address: station }),
    balanceOf(station),
    balanceOf(wallet),
    client.getBalance({ address: wallet }),
    client.getTransactionCount({ address: wallet }),
  ]);
  if (!isAddressEqual(onChain, station)) throw new Error(STATION_MISMATCH_MESSAGE);
  return { wallet, station, made: Boolean(code && code !== "0x"), stationUsdg, walletUsdg, walletEth, walletTxs };
}

/**
 * What a wallet needs next, from the chain alone, so the flow picks up wherever
 * it was left: `ready` it has gas, `make` and `pump` the station holds enough to
 * go on, `low` the station holds too little for the relay to act, and `fund`
 * nothing has reached it yet.
 */
export type FundingStep = "fund" | "low" | "make" | "pump" | "ready";

export function fundingStep(s: Pick<StationState, "made" | "stationUsdg" | "walletEth">): FundingStep {
  if (s.walletEth >= WALLET_GAS_OK_WEI) return "ready";
  if (s.stationUsdg >= STATION_MIN_USDG) return s.made ? "pump" : "make";
  return s.stationUsdg > 0n ? "low" : "fund";
}
