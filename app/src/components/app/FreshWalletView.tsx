"use client";

/**
 * Fund a fresh wallet from the private balance (lib/freshWallet), ready to use
 * Borro on Robinhood Chain. On the left the wallet, the amounts and what goes
 * public; on the right where the wallet stands, read from the chain, so the same
 * address picks up wherever it was left.
 *
 * A wallet made here exists only in this component: its key is never saved or
 * sent, and it is dropped as soon as the person says they have saved it.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { largestTopUpNote, pickTopUpNote } from "@/lib/agentTopUp";
import { shortAddress } from "@/lib/chain";
import { findCashOutLink, linkMessage } from "@/lib/cashOutPlan";
import { depositWallets, presetAmounts, sameAmountDeposit, sameAmountText } from "@/lib/cashOutPrivacy";
import { cashOutTargetProblem } from "@/lib/cashOutTarget";
import { useAppAccount, useDemo } from "@/lib/demo";
import {
  FRESH_MIN_GAS,
  GAS_DEFAULT,
  GAS_PRESETS,
  amountProblem,
  backLink,
  freshAddressProblem,
  fundFreshWallet,
  fundingPlan,
  gasProblem,
  getGas,
  mostForWallet,
  readFundLink,
  type FundWhen,
} from "@/lib/freshWallet";
import { BORRO_URL, GAS_STATION_CHAIN_ID, STATION_USDG, fundingStep, predictStation, readStationState, type StationState } from "@/lib/gasStation";
import { countPerson } from "@/lib/people";
import { getOrCreateReceiveIdentity } from "@/lib/receiveTag";
import { relayFor, type RelayNetworkStatus } from "@/lib/relay/client";
import { publicClientFor } from "@/lib/rhClient";
import { SCREEN_BLOCKED_MESSAGE } from "@/lib/screening";
import { screenWallets } from "@/lib/screeningClient";
import { HASH_SCHEME, formatFeePercent, formatAssetLabel, parseAssetAmount, shieldPoolAbi } from "@/lib/shield";
import { checkSweep, type SweepReader } from "@/lib/sweepCheck";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { ArrowUpRight } from "@/components/ui/ArrowUpRight";
import { CopyButton } from "@/components/ui/CodeBlock";
import { CashOutAmountChips } from "./CashOutPrivacy";
import { useNetwork } from "./NetworkProvider";
import { CashOutLinkNote, PLAN_WINDOWS, aboutTime } from "./PrivateCashOut";
import { WalletMenu } from "./WalletMenu";

/** How often the status reads the chain while the tab is showing. */
const READ_MS = 15_000;

const WHEN: [FundWhen, string][] = [["now", "Now"], ...PLAN_WINDOWS.map(([k, label]): [FundWhen, string] => [k, label])];

function ethLabel(wei: bigint): string {
  if (wei === 0n) return "0 ETH";
  const n = Number(wei) / 1e18;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`;
}

export function FreshWalletView() {
  const { address, isConnected } = useAppAccount();
  const { network, setNetworkKey } = useNetwork();
  const demoMode = useDemo();
  const { open, local, refresh } = useLocalShieldNotes(address);

  const onChain = network.chainId === GAS_STATION_CHAIN_ID;

  const [walletInput, setWalletInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [gasInput, setGasInput] = useState<string>(GAS_DEFAULT);
  const [when, setWhen] = useState<FundWhen>("hour");
  /** A wallet made here, until the person says its key is saved. Never written anywhere. */
  const [newKey, setNewKey] = useState<string | null>(null);
  const [relay, setRelay] = useState<RelayNetworkStatus | null>(null);
  const [relayChecked, setRelayChecked] = useState(false);
  const [state, setState] = useState<StationState | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backCopied, setBackCopied] = useState(false);
  const [backError, setBackError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { data: feeBpsRead } = useReadContract({
    address: network.pool ?? undefined,
    abi: shieldPoolAbi,
    functionName: "withdrawFeeBps",
    chainId: network.chainId,
    query: { enabled: onChain && Boolean(network.pool) && !demoMode, refetchInterval: 60_000 },
  });
  const feeBps = typeof feeBpsRead === "number" ? feeBpsRead : 0;
  const feeKnown = typeof feeBpsRead === "number";

  // A link can fill the form in. It sits in the fragment, so it never reaches a server, and nothing moves until the person presses send.
  useEffect(() => {
    const { to, amount } = readFundLink(window.location.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment only exists in the browser
    if (to) setWalletInput(to);
    if (amount) setAmountInput(amount);
  }, []);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- each network's relay is checked anew
    setRelayChecked(false);
    void relayFor(network.chainId).then((r) => {
      if (!live) return;
      setRelay(r);
      setRelayChecked(true);
    });
    return () => {
      live = false;
    };
  }, [network.chainId]);

  const walletClean = walletInput.trim();
  const deposited = useMemo(() => depositWallets(local, { chainId: network.chainId, pool: network.pool }), [local, network.chainId, network.pool]);
  const walletProblem = freshAddressProblem({
    to: walletClean,
    connected: address,
    deposited,
    targetProblem: (to) => cashOutTargetProblem(to, network),
  });
  const wallet: Address | null = walletClean && !walletProblem && isAddress(walletClean) ? getAddress(walletClean) : null;

  // The chain says where this wallet stands, so nothing needs remembering.
  useEffect(() => {
    if (!wallet || !onChain || demoMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to read for this address
      setState(null);
      setReadFailed(false);
      return;
    }
    let live = true;
    const read = () =>
      readStationState(publicClientFor(network), wallet).then(
        (s) => {
          if (!live) return;
          setState(s);
          setReadFailed(false);
        },
        () => live && setReadFailed(true)
      );
    void read();
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) void read();
    }, READ_MS);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [wallet, onChain, demoMode, network]);

  // Closing the tab mid-way loses nothing, but it stops the run part way.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const parsedAmount = amountInput.trim() ? parseAssetAmount(amountInput.trim(), STATION_USDG) : null;
  const amount = parsedAmount !== null && parsedAmount > 0n ? parsedAmount : null;
  const parsedGas = gasInput.trim() ? parseAssetAmount(gasInput.trim(), STATION_USDG) : null;
  const gas = parsedGas !== null && parsedGas > 0n ? parsedGas : null;
  const amountBad = amountProblem(amount, amountInput);
  const gasBad = gasProblem(gas, gasInput);

  const plan = wallet && amount !== null && gas !== null && !amountBad && !gasBad ? fundingPlan({ wallet, amount, gas, feeBps }) : null;
  const largest = largestTopUpNote(open, STATION_USDG);
  // gas comes out of the same balance, so Max and the round amounts leave room for it
  const most = mostForWallet(largest, gas);
  const source = plan ? pickTopUpNote(open, STATION_USDG, plan.total) : null;
  const shortOf =
    isConnected && plan && !source
      ? largest > 0n
        ? `Both come out of one balance, and your largest is ${formatAssetLabel(largest, STATION_USDG)}. Try a smaller amount.`
        : "Nothing to send in USDG yet. Add some privately first."
      : null;

  const scope = { chainId: network.chainId, pool: network.pool };
  const sameAmount = amount !== null ? sameAmountDeposit(local, { ...scope, asset: STATION_USDG, amountWei: amount, now }) : null;
  const link = amount !== null ? findCashOutLink(amount, local, STATION_USDG, now) : null;
  const linkNote = sameAmount ? sameAmountText(sameAmount.createdAt, now) : link ? linkMessage(link, now) : null;

  const step = state ? fundingStep(state) : null;
  const relayOk = Boolean(relay?.enabled);
  const stationOn = Boolean(relay?.gasStation);
  const ready = isConnected && relayOk && stationOn && feeKnown && HASH_SCHEME === "poseidon" && !newKey && source !== null && plan !== null && !busy;

  async function makeWallet() {
    setError(null);
    // only here, only in this tab: viem's generator, then the key is shown once
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const key = generatePrivateKey();
    setNewKey(key);
    setWalletInput(privateKeyToAccount(key).address);
  }

  async function reread() {
    if (!wallet) return;
    const s = await readStationState(publicClientFor(network), wallet).catch(() => null);
    if (s) setState(s);
  }

  /** What every cash out passes before anything moves, for both addresses. */
  async function checkTargets(to: Address, station: Address): Promise<boolean> {
    for (const t of [to, station]) {
      const problem = cashOutTargetProblem(t, network);
      if (problem) {
        setError(problem);
        return false;
      }
    }
    const check = checkSweep(publicClientFor(network) as unknown as SweepReader, network.chainId, to, STATION_USDG).catch(() => null);
    const swept = await Promise.race([check, new Promise<null>((r) => window.setTimeout(() => r(null), 4_000))]);
    if (swept?.swept) {
      setError(`Money sent to ${shortAddress(to, 4)} has been moved out automatically within seconds before, by another account. Use another address.`);
      return false;
    }
    const screen = await screenWallets([to, station], { chainId: network.chainId, asset: STATION_USDG, flow: "cashout" });
    if (!screen.allowed) {
      setError(screen.message ?? SCREEN_BLOCKED_MESSAGE);
      return false;
    }
    return true;
  }

  async function onFund() {
    if (!ready || !plan || !source || !wallet || !address || amount === null || gas === null) return;
    setError(null);
    setNotice(null);
    if (!(await checkTargets(wallet, plan.to[0]))) return;
    setBusy(true);
    try {
      const r = await fundFreshWallet({ note: source, wallet, amount, gas, feeBps, when, owner: address as Address, onStatus: setStatus });
      if (r.stoppedAt === null) {
        setAmountInput("");
        const [g, w] = r.jobs;
        setNotice(
          when === "now"
            ? "Both have landed. Now turn the gas money into ETH."
            : `Gas money goes out ${aboutTime(g!.sendAfter)}, your USDG ${aboutTime(w!.sendAfter)}. You can close Gloam. Come back with this address once the gas money lands.`
        );
      } else {
        const said = r.jobs.length ? "The gas money is on its way, your USDG is not." : "Nothing has gone out.";
        setError(
          r.maybeSent
            ? `${said} The last step may have gone out. Your money is safe in the vault and shows again once it lands.`
            : `${said} ${r.error ?? ""} The rest is safe in your private balance.`.replace(/\s+/g, " ")
        );
      }
      if (r.jobs.length > 0) countPerson("cashout", address, network.testnet);
    } catch (e) {
      // Refused before anything moved.
      setError(e instanceof Error ? e.message : "Could not fund this wallet.");
    } finally {
      setBusy(false);
      setStatus(null);
      refresh();
      void reread();
    }
  }

  async function onGetGas() {
    if (!wallet || busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const s = await getGas({ wallet, onStatus: setStatus });
      setState(s);
      if (fundingStep(s) === "ready") setNotice("ETH has landed in the wallet. It's ready for Borro.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get gas. Your USDG stays at the station.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function copyBack() {
    setBackError(null);
    try {
      const { tag } = await getOrCreateReceiveIdentity();
      await navigator.clipboard.writeText(backLink(tag, window.location.origin));
      setBackCopied(true);
      window.setTimeout(() => setBackCopied(false), 1_800);
    } catch {
      setBackError("Could not make the link. Open Receive and make a request for USDG instead.");
    }
  }

  if (!onChain) {
    return (
      <div className="gl-card max-w-[640px] p-5 sm:p-7">
        <h2 className="t-title">Fund a fresh wallet</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-soft">This runs on Robinhood Chain mainnet, where Borro is.</p>
        <button type="button" className="btn btn-ghost mt-5" onClick={() => setNetworkKey("robinhood-mainnet")}>
          Switch to Robinhood Chain
        </button>
      </div>
    );
  }

  // Until the relay answers the form stays away: it can't be used if this turns out to be off.
  if (!relayChecked) {
    return <div aria-busy="true" className="gl-card h-[420px] max-w-[640px] motion-safe:animate-pulse" />;
  }

  if (!stationOn) {
    return (
      <div className="gl-card max-w-[640px] p-5 sm:p-7">
        <h2 className="t-title">Fund a fresh wallet</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-soft">
          This isn&apos;t open yet. The step that gets a fresh wallet its gas is switched off, so nothing can move here for now.
        </p>
        <Link href="/docs/fresh-wallet" className="gl-arrowlink mt-5">
          How it will work
        </Link>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="gl-card min-w-0 p-5 sm:p-7">
        <h2 className="t-title">Fund a fresh wallet</h2>
        <p className="mt-1.5 max-w-[52ch] text-[14px] leading-relaxed text-mute">
          Send USDG from your private balance to a new wallet, with ETH for gas, so what you open on Borro doesn&apos;t point to your main wallet.
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="fresh-wallet" className="text-[13px] text-mute">
                Fresh wallet
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void makeWallet()}
                className="inline-flex min-h-10 items-center text-[13px] text-mute underline underline-offset-4 hover:text-foreground disabled:opacity-50"
              >
                Make a new one
              </button>
            </div>
            <input
              id="fresh-wallet"
              className="gl-input mt-1 font-mono text-[14px]"
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              value={walletInput}
              onChange={(e) => {
                setNewKey(null);
                setWalletInput(e.target.value);
              }}
              aria-invalid={Boolean(walletProblem)}
            />
            {walletProblem && <p className="mt-1.5 text-[12.5px] leading-relaxed text-warn">{walletProblem}</p>}
            {state && state.walletTxs > 0 && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
                This wallet has been used before. If it ever touched your main wallet, the chain still shows that.
              </p>
            )}
          </div>

          {newKey && (
            <div className="rounded-[16px] bg-warn-soft px-4 py-3.5">
              <p className="text-[13px] font-medium text-foreground">Save this key now</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-soft">
                It controls the new wallet. Gloam never saves or sends it, can&apos;t show it again and can&apos;t recover it.
              </p>
              <div className="mt-2.5 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-[10px] bg-background px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground">{newKey}</code>
                <CopyButton text={newKey} />
              </div>
              <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => setNewKey(null)}>
                I saved it. Hide the key
              </button>
            </div>
          )}

          <div className="gl-inputcard px-4 py-3.5 sm:px-5" data-invalid={Boolean(amountBad)}>
            <label htmlFor="fresh-amount" className="text-[13px] text-mute">
              USDG for the wallet
            </label>
            <input
              id="fresh-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              disabled={busy}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="tnum mt-1 w-full min-w-0 bg-transparent text-[34px] font-light leading-[1.15] tracking-[-0.02em] text-foreground outline-none! placeholder:text-faint"
            />
            <p className={`tnum mt-1 min-h-5 text-[12.5px] ${amountBad ? "text-warn" : "text-mute"}`}>
              {amountBad ?? (largest > 0n ? `Largest balance ${formatAssetLabel(largest, STATION_USDG)}` : " ")}
            </p>
          </div>
          <div className="-mt-3">
            <CashOutAmountChips
              presets={presetAmounts({ chainId: network.chainId, asset: STATION_USDG, spendable: most })}
              current={amount}
              maxActive={false}
              disabled={busy}
              onPick={setAmountInput}
              onMax={() => setAmountInput(formatUnits(most, 6))}
            />
          </div>

          <div>
            <label htmlFor="fresh-gas" className="text-[13px] text-mute">
              USDG to turn into gas
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="fresh-gas"
                inputMode="decimal"
                autoComplete="off"
                disabled={busy}
                value={gasInput}
                onChange={(e) => setGasInput(e.target.value)}
                aria-invalid={Boolean(gasBad)}
                className="gl-input tnum w-24! text-[14px]"
              />
              {GAS_PRESETS.map((g) => (
                <button
                  key={g}
                  type="button"
                  disabled={busy}
                  aria-pressed={gasInput === g}
                  onClick={() => setGasInput(g)}
                  className={`gl-chip tnum min-h-10 ${gasInput === g ? "border-foreground! text-foreground!" : ""}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <p className={`mt-1.5 text-[12.5px] leading-relaxed ${gasBad ? "text-warn" : "text-mute"}`}>
              {gasBad ?? `This goes to the wallet's gas station and comes out as ETH. It can only ever pay that wallet, so send what you need for gas.`}
            </p>
          </div>

          <div>
            <p id="fresh-when" className="text-[13px] text-mute">
              When
            </p>
            <div role="radiogroup" aria-labelledby="fresh-when" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WHEN.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={when === value}
                  disabled={busy}
                  onClick={() => setWhen(value)}
                  className={`min-h-[48px] rounded-[14px] border px-2 py-2.5 text-center text-[13.5px] leading-snug transition-colors disabled:opacity-60 ${
                    when === value ? "border-foreground bg-panel text-foreground" : "border-line text-soft hover:border-line-strong hover:bg-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
              {when === "now"
                ? "Sending right after you added money makes the two easier to line up."
                : "Each goes out at its own random time in that window, so timing says less."}
            </p>
          </div>

          {linkNote && <CashOutLinkNote text={linkNote} />}

          {plan && (
            <dl className="rounded-[16px] bg-surface px-4 py-3 text-[13.5px]">
              <SummaryRow label="From your private balance" value={formatAssetLabel(plan.total, STATION_USDG)} strong />
              <SummaryRow label={`Fee (${feeKnown ? formatFeePercent(feeBps) : "reading"})`} value={formatAssetLabel(plan.fee, STATION_USDG)} />
              <SummaryRow label="Wallet gets" value={formatAssetLabel(plan.arrives.wallet, STATION_USDG)} />
              <SummaryRow label="Gas station gets" value={formatAssetLabel(plan.arrives.station, STATION_USDG)} />
            </dl>
          )}

          <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1.5 rounded-[14px] border border-line px-4 py-3 text-[12.5px] leading-relaxed">
            <dt className="text-foreground">Public</dt>
            <dd className="text-soft">The fresh wallet, both amounts, when they land, and everything the wallet does on Borro, including the position and its size.</dd>
            <dt className="flex items-center gap-1.5 text-sealed">
              <LockGlyph />
              Private
            </dt>
            <dd className="text-soft">Which deposit the money came from, and your other balance and payments. Amounts and timing can still link wallets.</dd>
          </dl>

          {shortOf && <p className="text-[12.5px] leading-relaxed text-warn">{shortOf}</p>}
          {relayChecked && !relayOk && <p className="text-[12.5px] leading-relaxed text-warn">This needs the Gloam relay, which is off right now.</p>}

          {busy && status ? (
            <div aria-live="polite" className="rounded-[16px] bg-sealed-soft px-4 py-3.5">
              <p className="text-[13.5px] text-foreground">{status}</p>
              <p className="mt-1 text-[12.5px] text-mute">Keep this tab open until it finishes.</p>
            </div>
          ) : isConnected ? (
            <button type="button" className="btn btn-ink btn-lg w-full" disabled={!ready} onClick={() => void onFund()}>
              {plan ? `Send ${formatAssetLabel(plan.total, STATION_USDG)}` : "Fund this wallet"}
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-surface px-4 py-3">
              <p className="text-[14px] text-mute">Connect the wallet that holds your private balance.</p>
              <WalletMenu />
            </div>
          )}

          {error && (
            <p role="alert" className="text-[13px] leading-relaxed text-warn">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-[16px] bg-sealed-soft px-4 py-3.5 text-[13px] leading-relaxed text-foreground">
              {notice}
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        {wallet && (
          <div className="gl-card p-5">
            <h3 className="text-[15px] font-medium text-foreground">Where it stands</h3>
            {state ? (
              <dl className="mt-3 text-[13.5px]">
                <SummaryRow label="USDG in the wallet" value={formatAssetLabel(state.walletUsdg, STATION_USDG)} />
                <SummaryRow label="ETH in the wallet" value={ethLabel(state.walletEth)} />
                <SummaryRow label="USDG at the station" value={formatAssetLabel(state.stationUsdg, STATION_USDG)} />
                <SummaryRow label="Station" value={state.made ? "Made" : "Not made yet"} />
              </dl>
            ) : (
              <p className="mt-3 text-[13px] text-mute">{readFailed ? "Could not read the chain. Trying again." : "Reading the chain…"}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <p className="min-w-0 text-[12.5px] text-mute">
                Station <span className="font-mono">{shortAddress(predictStation(wallet), 4)}</span>
              </p>
              <CopyButton text={predictStation(wallet)} />
            </div>
            {(step === "make" || step === "pump") && (
              <button type="button" className="btn btn-ink mt-4 w-full" disabled={busy || !stationOn} onClick={() => void onGetGas()}>
                Turn it into ETH
              </button>
            )}
            {step === "low" && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-mute">
                The station holds too little for the relay to act. Send it at least {formatAssetLabel(FRESH_MIN_GAS, STATION_USDG)} more.
              </p>
            )}
            {step === "ready" && (
              <a href={BORRO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ink mt-4 inline-flex w-full items-center justify-center gap-1.5">
                Open Borro
                <ArrowUpRight />
              </a>
            )}
            {step === "ready" && (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-mute">
                Connect the fresh wallet there, not your main one. Borro is a separate project. Gloam doesn&apos;t run it.
              </p>
            )}
          </div>
        )}

        <div className="gl-card p-5">
          <h3 className="text-[15px] font-medium text-foreground">Bring it back</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-soft">
            When you&apos;re done, copy this link and open it in Gloam with the fresh wallet connected. It adds the USDG privately and pays it to your main balance. The deposit is public, the payment is private.
          </p>
          <button type="button" className="btn btn-ghost mt-3.5 w-full" onClick={() => void copyBack()}>
            {backCopied ? "Copied" : "Copy the link"}
          </button>
          {backError && <p className="mt-2 text-[12.5px] leading-relaxed text-warn">{backError}</p>}
          <Link href="/docs/fresh-wallet" className="gl-arrowlink mt-3.5">
            The guide
          </Link>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-mute">{label}</dt>
      <dd className={`tnum text-right ${strong ? "font-medium text-foreground" : "text-soft"}`}>{value}</dd>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
