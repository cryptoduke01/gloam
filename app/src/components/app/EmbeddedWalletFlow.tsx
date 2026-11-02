"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AuthState, useTurnkey } from "@turnkey/react-wallet-kit";
import { useAccount } from "wagmi";
import { useModalFocus } from "@/hooks/useModalFocus";
import { bridgeVisible } from "@/lib/bridge";
import { shortAddress } from "@/lib/chain";
import { SPONSOR_CHAINS, TEMPO_FEE_CHAIN_IDS } from "@/lib/embeddedGas";
import { embeddedRecoveryResult, onEmbeddedRecovery } from "@/lib/embeddedRecovery";
import {
  DEFAULT_WALLET_NAME,
  EMBEDDED_CONNECTOR_ID,
  WALLET_NAME_MAX,
  createWalletErrorText,
  embeddedFlowStep,
  pickEmbeddedWallet,
  walletNameFor,
  walletNameProblem,
} from "@/lib/embeddedWallet";
import { networkName } from "@/lib/networks";
import { onEmbeddedSheetRequest, setEmbeddedNeedsWallet } from "@/lib/turnkeyBridge";
import { useNetwork } from "./NetworkProvider";

const noopSubscribe = () => () => {};

/**
 * Creating a Gloam wallet, then adding money to it. Opens by itself once someone
 * signs in with no wallet yet, and again from the wallet menu (Add funds).
 *
 *  1. Create your wallet: an optional name and one button. The key is made in
 *     Turnkey's secure hardware; the page never sees it and there is no seed phrase.
 *  2. Add funds: the ways in the app already has, the ones that cost this wallet
 *     nothing first (lib/embeddedGas).
 *
 * The steps come from embeddedFlowStep (lib/embeddedWallet). One sheet per
 * sign-in: it is keyed by the account, so signing out starts it over.
 */
export default function EmbeddedWalletFlow() {
  const { authState, session } = useTurnkey();
  const signedIn = authState === AuthState.Authenticated;
  const key = signedIn ? (session?.organizationId ?? "signed-in") : "signed-out";
  return <Sheet key={key} signedIn={signedIn} />;
}

function Sheet({ signedIn }: { signedIn: boolean }) {
  const { wallets, createWallet, refreshWallets } = useTurnkey();
  const { address: connected, connector } = useAccount();

  const [listRead, setListRead] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState("");
  const [showAddress, setShowAddress] = useState(false);

  const wallet = pickEmbeddedWallet(wallets);
  const step = embeddedFlowStep({
    signedIn,
    checked: listRead || Boolean(wallet),
    hasWallet: Boolean(wallet),
    creating,
    error,
    funding,
    dismissed,
  });
  // Read the wallet list once after signing in, so someone with a wallet never sees
  // "Create wallet". Once: the kit hands out a new refreshWallets more often than that.
  const refresh = useRef(refreshWallets);
  useEffect(() => {
    refresh.current = refreshWallets;
  });
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void refresh.current()
      .catch(() => [])
      .finally(() => {
        if (live) setListRead(true);
      });
    return () => {
      live = false;
    };
  }, [signedIn]);

  // The header offers Create wallet while there is none, also after this sheet was closed.
  const needsWallet = signedIn && (listRead || Boolean(wallet)) && !wallet;
  useEffect(() => {
    setEmbeddedNeedsWallet(needsWallet);
  }, [needsWallet]);
  useEffect(() => () => setEmbeddedNeedsWallet(false), []);

  useEffect(
    () =>
      onEmbeddedSheetRequest((req) => {
        setDismissed(false);
        setError(null);
        if (req === "funding") setFunding(true);
      }),
    []
  );

  const close = () => {
    if (creating) return;
    setDismissed(true);
    setShowAddress(false);
  };

  const nameProblem = walletNameProblem(name);

  async function create() {
    if (creating || nameProblem) return;
    setCreating(true);
    setError(null);
    try {
      await createWallet({ walletName: walletNameFor(name), accounts: ["ADDRESS_FORMAT_ETHEREUM"] });
      await refreshWallets().catch(() => []);
      setFunding(true);
      void import("@/lib/track").then(({ track }) => track("wallet_connect", { method: "gloam_wallet_created" }));
    } catch (e) {
      console.warn("[Gloam] Wallet not created:", e);
      setError(createWalletErrorText(e));
    } finally {
      setCreating(false);
    }
  }

  if (step !== "create" && step !== "creating" && step !== "failed" && step !== "funding") return null;
  return (
    <WalletSheet
      step={step}
      name={name}
      onName={setName}
      nameProblem={nameProblem}
      error={error}
      onCreate={() => void create()}
      onClose={close}
      address={connected && connector?.id === EMBEDDED_CONNECTOR_ID ? connected : wallet?.address}
      showAddress={showAddress}
      onShowAddress={() => setShowAddress(true)}
    />
  );
}

/**
 * The sheet itself, drawn from props only (the Turnkey wiring is in Sheet above),
 * so every step can be looked at without a live sign-in.
 */
export function WalletSheet({
  step,
  name,
  onName,
  nameProblem,
  error,
  onCreate,
  onClose,
  address,
  showAddress,
  onShowAddress,
}: {
  step: "create" | "creating" | "failed" | "funding";
  name: string;
  onName: (name: string) => void;
  nameProblem: string | null;
  error: string | null;
  onCreate: () => void;
  onClose: () => void;
  address: string | undefined;
  showAddress: boolean;
  onShowAddress: () => void;
}) {
  const { network } = useNetwork();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduce = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const creating = step === "creating";
  const fundingStep = step === "funding";
  useModalFocus(dialog, onClose, { initial: step === "create" ? nameField : undefined });

  if (!mounted) return null;
  const where = networkName(network);

  return createPortal(
    <div
      ref={dialog}
      tabIndex={-1}
      className="fixed inset-0 z-[210] flex items-end justify-center outline-none sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gw-title"
    >
      <motion.button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative z-[1] max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[24px] bg-panel px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-6 shadow-pop sm:rounded-[24px] sm:px-7 sm:pb-7"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="gw-title" className="text-[20px] font-medium tracking-[-0.01em] text-foreground">
            {fundingStep ? "Add funds" : "Create your wallet"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            aria-label="Close"
            className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-mute transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {fundingStep ? (
          <FundingStep
            address={address}
            where={where}
            chainId={network.chainId}
            coin={network.chain.nativeCurrency.symbol}
            bridge={bridgeVisible(network)}
            showAddress={showAddress}
            onShowAddress={onShowAddress}
            onLeave={onClose}
          />
        ) : (
          <form
            className="mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate();
            }}
          >
            <p className="text-[13.5px] leading-relaxed text-mute">
              Its key is made inside Turnkey&apos;s secure hardware and never reaches this page. There&apos;s no seed
              phrase to write down.
            </p>
            <label htmlFor="gw-name" className="mt-5 block text-[13px] text-mute">
              Wallet name (optional)
            </label>
            <input
              id="gw-name"
              ref={nameField}
              className="gl-input mt-2 text-[14px]"
              placeholder={DEFAULT_WALLET_NAME}
              maxLength={WALLET_NAME_MAX + 10}
              autoComplete="off"
              spellCheck={false}
              disabled={creating}
              value={name}
              onChange={(e) => onName(e.target.value)}
              aria-invalid={Boolean(nameProblem)}
            />
            {nameProblem && <p className="mt-1.5 text-[12.5px] leading-relaxed text-warn">{nameProblem}</p>}
            <p className="mt-3 text-[12.5px] leading-relaxed text-mute">
              Sign in with the same email or passkey on any device to open it again.
            </p>
            {step === "failed" && error && (
              <p role="alert" className="mt-4 text-[13px] leading-relaxed text-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={creating || Boolean(nameProblem)} className="btn btn-ink btn-lg btn-block mt-6">
              {creating ? "Creating…" : step === "failed" ? "Try again" : "Create wallet"}
            </button>
          </form>
        )}
      </motion.div>
    </div>,
    document.body
  );
}

function FundingStep({
  address,
  where,
  chainId,
  coin,
  bridge,
  showAddress,
  onShowAddress,
  onLeave,
}: {
  address: string | undefined;
  where: string;
  chainId: number;
  coin: string;
  bridge: boolean;
  showAddress: boolean;
  onShowAddress: () => void;
  onLeave: () => void;
}) {
  const recovery = useSyncExternalStore(onEmbeddedRecovery, embeddedRecoveryResult, () => null);
  const backedUp = recovery && (recovery.result.kind === "on" || recovery.result.kind === "already");
  const passkeyInstead = recovery?.result.kind === "unsupported";
  const fees = TEMPO_FEE_CHAIN_IDS.has(chainId)
    ? "Network fees come out of the stablecoin you send."
    : SPONSOR_CHAINS.has(chainId)
      ? "Network fees for adding it privately are covered."
      : `Keep a little ${coin} in it for network fees.`;

  return (
    <div className="mt-2">
      <p className="text-[13.5px] leading-relaxed text-mute">
        Your wallet is ready on {where}.
      </p>
      <ul className="mt-4 grid gap-1">
        <FundRow href="/app/vault?tab=move&mode=receive" title="Claim a payment link" onGo={onLeave}>
          Open a link someone sent you, or paste it in Receive. No gas needed.
        </FundRow>
        <FundRow href="/app/vault?tab=move&mode=receive" title="Receive a private payment" onGo={onLeave}>
          Share your Gloam address. Payments land in your private balance, with no gas needed.
        </FundRow>
        {bridge && (
          <FundRow href="/app/vault?tab=shield&bridge=open" title="Bring money from another chain" onGo={onLeave}>
            From a Solana wallet it goes straight into your private balance. From other chains it lands here first.
          </FundRow>
        )}
        <li>
          <button
            type="button"
            onClick={onShowAddress}
            aria-expanded={showAddress}
            className="flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-surface"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] text-foreground">Send from another wallet or an exchange</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mute">
                Send to this wallet&apos;s address on {where}, then add it privately.
              </span>
            </span>
            <Chevron down={showAddress} />
          </button>
          {showAddress && address && <AddressPanel address={address} fees={fees} onLeave={onLeave} />}
        </li>
      </ul>

      {(backedUp || passkeyInstead) && (
        <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-mute">
          {backedUp && (
            <span className="mt-[2px] shrink-0 text-sealed" aria-hidden>
              <LockGlyph />
            </span>
          )}
          {backedUp
            ? "Your private balance is backed up to this wallet. Sign in on another device and it comes back."
            : "To back up your private balance, turn on recovery with a passkey in Settings."}
        </p>
      )}

      <button type="button" onClick={onLeave} className="btn btn-quiet btn-block mt-5">
        Later
      </button>
    </div>
  );
}

function FundRow({ href, title, children, onGo }: { href: string; title: string; children: ReactNode; onGo: () => void }) {
  return (
    <li>
      <Link
        href={href}
        onClick={onGo}
        className="flex items-start gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] text-foreground">{title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-mute">{children}</span>
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

function AddressPanel({ address, fees, onLeave }: { address: string; fees: string; onLeave: () => void }) {
  const [qr, setQr] = useState<{ for: string; src: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void import("qrcode")
      .then((QR) => QR.toDataURL(address, { margin: 1, width: 320, errorCorrectionLevel: "M" }))
      .then((src) => live && setQr({ for: address, src }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  return (
    <div className="mx-3 mb-2 mt-1 rounded-[12px] bg-surface p-4">
      {qr?.for === address && (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL
        <img src={qr.src} alt="This wallet's address as a QR code" width={160} height={160} className="mx-auto mb-3 rounded-[10px] bg-white p-1.5" />
      )}
      <p className="tnum break-all text-center text-[13px] text-foreground">{address}</p>
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(address).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            })
          }
          className="btn btn-ghost btn-sm"
          aria-label={`Copy address ${shortAddress(address)}`}
        >
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>
      <p className="mt-3 text-center text-[12.5px] leading-relaxed text-mute">
        {fees}{" "}
        <Link href="/app/vault?tab=shield" onClick={onLeave} className="text-foreground underline underline-offset-2">
          Add privately
        </Link>{" "}
        once it arrives.
      </p>
    </div>
  );
}

function Chevron({ down = false }: { down?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`mt-1 shrink-0 text-faint transition-transform ${down ? "rotate-90" : ""}`}
    >
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
