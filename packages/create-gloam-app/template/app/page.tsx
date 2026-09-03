"use client";

/**
 * Reference wrapper — shield a private balance IN THE BROWSER with @gloamtrade/sdk.
 * Connect an injected wallet, prove the shield client-side (snarkjs fetches the
 * circuit over HTTP), and deposit via shieldBound(). Notes are kept in
 * localStorage keyed by commitment; the note secret is the only spend authority
 * and never leaves the browser. The private balance is read back straight from
 * the pool with commitmentSeen() — no backend, no indexer.
 */
import { useCallback, useEffect, useState } from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  defineChain,
  parseEther,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import {
  buildShieldBoundIntent,
  artifactProver,
  SEALED_VAULT,
  RH_TESTNET_CHAIN_ID,
} from "@gloamtrade/sdk";

const RPC = "https://rpc.testnet.chain.robinhood.com";
const CHAIN_ID_HEX = `0x${RH_TESTNET_CHAIN_ID.toString(16)}`;
// Copy shield.wasm + shield_final.zkey into ./public/circuits, or point this at
// a hosted copy (e.g. https://gloam.trade/circuits) if it serves CORS.
const ARTIFACTS = process.env.NEXT_PUBLIC_GLOAM_ARTIFACTS ?? "/circuits";

const rhTestnet = defineChain({
  id: RH_TESTNET_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
});

const poolAbi = [
  {
    type: "function",
    name: "shieldBound",
    stateMutability: "payable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "commitmentSeen",
    stateMutability: "view",
    inputs: [{ name: "c", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

type StoredNote = {
  commitment: Hex;
  secret: Hex;
  amountEth: string;
  hash: Hex;
  live?: boolean;
};

const STORE_KEY = "gloam:web-shield:notes";

function loadNotes(): StoredNote[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveNotes(notes: StoredNote[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(notes));
}

function getEthereum(): { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: never }).ethereum ?? null;
}

const pub = createPublicClient({ chain: rhTestnet, transport: http(RPC) });

export default function Page() {
  const [account, setAccount] = useState<Address | null>(null);
  const [amount, setAmount] = useState("0.001");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState(false);
  const [notes, setNotes] = useState<StoredNote[]>([]);

  const say = (s: string, isErr = false) => {
    setStatus(s);
    setErr(isErr);
  };

  const refreshLive = useCallback(async (list: StoredNote[]) => {
    const checked = await Promise.all(
      list.map(async (n) => {
        try {
          const live = (await pub.readContract({
            address: SEALED_VAULT,
            abi: poolAbi,
            functionName: "commitmentSeen",
            args: [n.commitment],
          })) as boolean;
          return { ...n, live };
        } catch {
          return { ...n, live: undefined };
        }
      })
    );
    setNotes(checked);
  }, []);

  useEffect(() => {
    const initial = loadNotes();
    setNotes(initial);
    if (initial.length) void refreshLive(initial);
  }, [refreshLive]);

  async function connect() {
    const eth = getEthereum();
    if (!eth) return say("No injected wallet found. Install one and reload.", true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
      // Make sure the wallet is on Robinhood Chain testnet.
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID_HEX }],
        });
      } catch {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: "Robinhood Chain Testnet",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPC],
              blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
            },
          ],
        });
      }
      setAccount(accounts[0]);
      say(`Connected ${accounts[0]}`);
    } catch (e) {
      say(e instanceof Error ? e.message : "Connection failed", true);
    }
  }

  async function shield() {
    const eth = getEthereum();
    if (!eth || !account) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(amount);
      if (amountWei <= 0n) throw new Error("Amount must be positive.");
    } catch {
      return say("Enter a valid amount.", true);
    }

    setBusy(true);
    try {
      say("Proving in your browser… (first run fetches the circuit)");
      const intent = await buildShieldBoundIntent({
        amountWei,
        prover: artifactProver({
          wasm: `${ARTIFACTS}/shield.wasm`,
          zkey: `${ARTIFACTS}/shield_final.zkey`,
        }),
      });

      say("Confirm the deposit in your wallet…");
      const wallet = createWalletClient({ account, chain: rhTestnet, transport: custom(eth) });
      const hash = await wallet.writeContract({
        address: intent.exec.poolAddress,
        abi: poolAbi,
        functionName: "shieldBound",
        args: intent.exec.args as readonly [Address, bigint, Hex, Hex],
        value: intent.exec.valueWei,
        account,
      });

      // Persist the note BEFORE waiting — losing the secret loses the funds.
      const note: StoredNote = {
        commitment: intent.note.commitment,
        secret: intent.note.secret,
        amountEth: amount,
        hash,
      };
      const next = [note, ...loadNotes()];
      saveNotes(next);
      setNotes(next);

      say("Submitted. Waiting for confirmation…");
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted.");
      say("Shielded. Your private balance is confirmed on-chain.");
      void refreshLive(next);
    } catch (e) {
      say(e instanceof Error ? e.message : "Shield failed", true);
    } finally {
      setBusy(false);
    }
  }

  const total = notes
    .filter((n) => n.live !== false)
    .reduce((sum, n) => sum + parseEther(n.amountEth), 0n);

  return (
    <main className="wrap">
      <p className="eyebrow">@gloamtrade/sdk · browser example</p>
      <h1>Shield a private balance</h1>
      <p className="lede">
        Deposit ETH into a shielded note on Robinhood Chain testnet. The proof is
        generated in your browser; the note secret never leaves it.
      </p>

      <div className="card">
        {!account ? (
          <button onClick={connect}>Connect wallet</button>
        ) : (
          <>
            <label htmlFor="amt">Amount (ETH)</label>
            <div className="row">
              <input
                id="amt"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                disabled={busy}
              />
              <button onClick={shield} disabled={busy}>
                {busy ? "Working…" : "Shield privately"}
              </button>
            </div>
          </>
        )}
        <p className={`status${err ? " err" : ""}`}>{status}</p>
      </div>

      <div className="card">
        <label>Your private balance</label>
        <p className="total">{formatEther(total)} ETH</p>
        {notes.length === 0 ? (
          <p className="status">No shielded notes yet.</p>
        ) : (
          notes.map((n) => (
            <div className="note" key={n.commitment}>
              <span className="mono">{n.commitment.slice(0, 10)}…{n.commitment.slice(-6)}</span>
              <span className="mono">{n.amountEth} ETH</span>
              <span className={`pill${n.live ? " live" : ""}`}>
                {n.live === undefined ? "…" : n.live ? "live" : "pending"}
              </span>
            </div>
          ))
        )}
      </div>

      <p className="foot">
        Testnet only, dev-ceremony keys. Get funds from the{" "}
        <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer">
          faucet
        </a>
        . Docs at{" "}
        <a href="https://gloam.trade/docs/sdk" target="_blank" rel="noreferrer">
          gloam.trade/docs/sdk
        </a>
        .
      </p>
    </main>
  );
}
