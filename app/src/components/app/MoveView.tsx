"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { AsciiImage } from "@/components/AsciiImage";
import { useLocalShieldNotes } from "@/hooks/useLocalShieldNotes";
import { useShieldTree } from "@/hooks/useShieldTree";
import {
  assetLabel,
  isNativeAsset,
  isShieldDeployed,
} from "@/lib/shield";
import { PROOF_LAYOUT_VERSION } from "@/lib/note";
import {
  buildUnshieldWitness,
  downloadWitnessJson,
  formatWitnessSummary,
  type UnshieldWitness,
} from "@/lib/prover";
import { formatEth, shortAddress } from "@/lib/chain";
import { StatusPill } from "./StatusPill";

/** Private transfer / unshield prep — no fake proofs. */
export function MoveView() {
  const shieldLive = isShieldDeployed();
  const { address } = useAccount();
  const { open } = useLocalShieldNotes(address);
  const {
    loading: treeLoading,
    error: treeError,
    matchesChain,
    leafCount,
    root,
    pathForLeaf,
    refresh: refreshTree,
  } = useShieldTree();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [witnessLog, setWitnessLog] = useState<string | null>(null);
  const [lastWitness, setLastWitness] = useState<UnshieldWitness | null>(null);

  const boundNotes = useMemo(
    () =>
      open.filter(
        (n) =>
          n.bound &&
          n.secret &&
          n.secret !== "0x" &&
          n.leafIndex != null
      ),
    [open]
  );

  const selected =
    boundNotes.find((n) => n.id === selectedId) ?? boundNotes[0] ?? null;

  function onBuildWitness() {
    if (!selected || !address || selected.leafIndex == null) return;
    const path = pathForLeaf(selected.leafIndex);
    if (!path) {
      setLastWitness(null);
      setWitnessLog(
        "No Merkle path — wait for tree sync or refresh. Leaf may be missing."
      );
      return;
    }
    const w = buildUnshieldWitness({
      secret: selected.secret,
      amount: BigInt(selected.amountWei),
      asset: selected.asset,
      to: address,
      path,
      root: path.root,
    });
    setLastWitness(w);
    setWitnessLog(formatWitnessSummary(w));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-7">
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="relative h-40 border-b border-line">
            <AsciiImage
              src="/ascii/move.png"
              alt=""
              tone="plate"
              className="h-full w-full opacity-50"
              sizes="60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/80 to-transparent" />
            <div className="absolute bottom-4 left-5">
              <StatusPill tone="warn">Proofs not live</StatusPill>
              <p className="mt-2 font-display text-2xl text-foreground">
                Private move
              </p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm leading-relaxed text-mute">
              Phase 2 prep: rebuild the pool Merkle tree, open a bound note, pack
              an unshield witness. We still do not submit fake proofs.
            </p>

            <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
                Merkle tree
              </p>
              <dl className="mt-2 space-y-1 text-mute">
                <div className="flex justify-between gap-2">
                  <dt>Leaves</dt>
                  <dd className="text-foreground">
                    {treeLoading ? "…" : leafCount}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Matches pool</dt>
                  <dd className="text-foreground">
                    {matchesChain == null
                      ? "…"
                      : matchesChain
                        ? "Yes"
                        : "No"}
                  </dd>
                </div>
                {root && (
                  <div className="flex justify-between gap-2">
                    <dt>Root</dt>
                    <dd className="font-mono text-[11px] text-foreground">
                      {shortAddress(root, 6)}
                    </dd>
                  </div>
                )}
              </dl>
              {treeError && (
                <p className="mt-2 text-xs text-red-500">{treeError}</p>
              )}
              <button
                type="button"
                onClick={() => void refreshTree()}
                disabled={treeLoading}
                className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs text-foreground hover:border-lime/40 disabled:opacity-50"
              >
                {treeLoading ? "Syncing…" : "Resync tree"}
              </button>
            </div>

            {shieldLive && boundNotes.length > 0 ? (
              <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                  Bound notes (this browser)
                </p>
                <ul className="mt-2 divide-y divide-line">
                  {boundNotes.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(n.id);
                          setWitnessLog(null);
                        }}
                        className={`flex w-full items-center justify-between gap-2 py-2.5 text-left ${
                          selected?.id === n.id ? "text-lime" : "text-foreground"
                        }`}
                      >
                        <span>
                          {isNativeAsset(n.asset)
                            ? formatEth(BigInt(n.amountWei))
                            : formatUnits(BigInt(n.amountWei), 18)}{" "}
                          {assetLabel(n.asset)}
                          <span className="ml-2 font-mono text-[10px] text-mute">
                            leaf #{n.leafIndex}
                          </span>
                        </span>
                        {selected?.id === n.id && (
                          <span className="text-[10px] text-lime">selected</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onBuildWitness}
                    disabled={!selected || !matchesChain}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-lime/40 px-4 text-sm font-medium text-foreground hover:bg-lime/10 disabled:opacity-50"
                  >
                    Build unshield witness
                  </button>
                  <button
                    type="button"
                    onClick={() => lastWitness && downloadWitnessJson(lastWitness)}
                    disabled={!lastWitness?.checks.pathValid || !lastWitness.checks.commitmentMatches}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line px-4 text-sm text-foreground hover:border-lime/40 disabled:opacity-50"
                  >
                    Download JSON
                  </button>
                </div>
                {witnessLog && (
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-panel p-3 font-mono text-[10px] leading-relaxed text-mute">
                    {witnessLog}
                  </pre>
                )}
                <p className="mt-2 text-xs text-mute">
                  Witness packs public inputs for layout v{PROOF_LAYOUT_VERSION}
                  (circom input included in JSON). Proving key not deployed —
                  nothing is submitted on-chain.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-background px-4 py-3 text-sm text-mute">
                <p className="text-foreground">No bound notes in this browser.</p>
                <p className="mt-1">
                  Shield again after the Phase 2 note update so amount/asset are
                  locked into the commitment. Older deposits are still in the
                  pool but cannot open under the new scheme.
                </p>
                {shieldLive && (
                  <Link
                    href="/app/shield"
                    className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-lime px-4 text-sm font-semibold text-black"
                  >
                    Shield bound note
                  </Link>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href="/app/shield"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm text-foreground"
              >
                Shield
              </Link>
              <Link
                href="/app/send"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm text-foreground"
              >
                Send ETH (public)
              </Link>
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:col-span-5">
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            Pipeline
          </p>
          <ul className="mt-3 space-y-2 text-foreground">
            <li>
              <span className="text-lime">●</span> Bound notes
            </li>
            <li>
              <span className="text-lime">●</span> Tree sync + Merkle path
            </li>
            <li>
              <span className="text-lime">●</span> Unshield witness pack
            </li>
            <li>
              <span className="text-mute">○</span> Circom/snark prove
            </li>
            <li>
              <span className="text-mute">○</span> On-chain verifier
            </li>
            <li>
              <span className="text-mute">○</span> unshield() tx
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-mute">
          <p className="text-foreground">
            Circuits live under{" "}
            <code className="text-lime">contracts/circuits/</code>. Tree is
            keccak (matches the live pool). Snarks may later migrate to Poseidon
            with a new deploy.
          </p>
        </div>
      </aside>
    </div>
  );
}
