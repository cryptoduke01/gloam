"use client";

import { useState, type FormEvent } from "react";
import { getNetwork } from "@/lib/networks";
import { FEE_CHAINS } from "@/lib/partnerFeeMath";
import { isValidReceiveTag } from "@/lib/receiveTag";
import { portal, PortalError, type PartnerAccount } from "./client";
import { Card, Field, fmtUsd, Notice } from "./ui";

/** "0.05" dollars -> 5 cents; "0.25" percent -> 25 bps. Null when not a number in range. */
function toHundredths(raw: string, max: number): number | null {
  const s = raw.trim();
  if (!/^\d*(\.\d{0,2})?$/.test(s) || s === "" || s === ".") return null;
  const v = Math.round(Number(s) * 100);
  return v >= 0 && v <= max ? v : null;
}

const hundredths = (n: number) => (n / 100).toFixed(2);

const feeToOf = (p: PartnerAccount) => Object.fromEntries(FEE_CHAINS.map((c) => [c, p.feeTo?.[c] ?? ""])) as Record<string, string>;

export function SettingsPanel({ partner, onSaved }: { partner: PartnerAccount; onSaved: (p: PartnerAccount) => void }) {
  const [name, setName] = useState(partner.name);
  const [website, setWebsite] = useState(partner.website ?? "");
  const [flat, setFlat] = useState(hundredths(partner.fees.privatePaymentCents));
  const [cashout, setCashout] = useState(hundredths(partner.fees.cashoutBps));
  const [deposit, setDeposit] = useState(hundredths(partner.fees.depositBps));
  const [feeTo, setFeeTo] = useState<Record<string, string>>(() => feeToOf(partner));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const cents = toHundredths(flat, 100);
  const cBps = toHundredths(cashout, 100);
  const dBps = toHundredths(deposit, 100);
  const badTag = (v: string) => v.trim() !== "" && !isValidReceiveTag(v.trim());
  const anyFee = (cents ?? 0) > 0 || (cBps ?? 0) > 0 || (dBps ?? 0) > 0;
  const noAddress = anyFee && FEE_CHAINS.every((c) => !feeTo[c]?.trim());

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    if (cents == null) return setErr("The fee per private payment must be between $0.00 and $1.00.");
    if (cBps == null || dBps == null) return setErr("Cash out and deposit fees must be between 0% and 1%, in steps of 0.01%.");
    if (Object.values(feeTo).some(badTag)) return setErr("A fee address is not a Gloam address. Copy it from Receive in the Gloam app (it starts with gloamr1.).");
    setBusy(true);
    try {
      const r = await portal<{ partner: PartnerAccount }>("/account", {
        method: "PUT",
        body: {
          name,
          website,
          fees: { privatePaymentCents: cents, cashoutBps: cBps, depositBps: dBps },
          feeTo: Object.fromEntries(Object.entries(feeTo).map(([k, v]) => [k, v.trim()])),
        },
      });
      onSaved(r.partner);
      // Show what was stored (checksummed addresses, cleaned name and link).
      setName(r.partner.name);
      setWebsite(r.partner.website ?? "");
      setFeeTo(feeToOf(r.partner));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof PortalError ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const example = (amount: number, bps: number | null) => (bps == null ? "?" : fmtUsd(Math.floor(amount * bps) / 10_000));

  return (
    <form onSubmit={save} className="space-y-4">
      <Card
        title="Your fee"
        foot="Your users pay this on top, as one private payment to your Gloam address, before their payment or cash out. The Gloam app adds it on flows from your links and shows it before they confirm. With your API key, your app adds it. Private swaps carry no fee."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Per private payment" htmlFor="fee-flat" hint="A flat amount, up to $1.00, on dollar stablecoins. The payment's amount is hidden, even from us.">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-mute">$</span>
              <input id="fee-flat" inputMode="decimal" className="gl-input tnum pl-8" value={flat} onChange={(e) => setFlat(e.target.value)} />
            </div>
          </Field>
          <Field label="Per cash out" htmlFor="fee-cashout" hint="A share of the amount, up to 1%. Cash outs are public.">
            <div className="relative">
              <input id="fee-cashout" inputMode="decimal" className="gl-input tnum pr-9" value={cashout} onChange={(e) => setCashout(e.target.value)} />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-mute">%</span>
            </div>
          </Field>
          <Field label="Per deposit" htmlFor="fee-deposit" hint="A share of the amount, up to 1%. Zero keeps adding money free.">
            <div className="relative">
              <input id="fee-deposit" inputMode="decimal" className="gl-input tnum pr-9" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-mute">%</span>
            </div>
          </Field>
        </div>
        <div className="mt-6 rounded-xl bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-soft">
          Your users pay <span className="tnum text-foreground">{cents == null ? "?" : fmtUsd(cents / 100)}</span> on a private payment,{" "}
          <span className="tnum text-foreground">{example(1000, cBps)}</span> on a $1,000 cash out and{" "}
          <span className="tnum text-foreground">{example(1000, dBps)}</span> on a $1,000 deposit, in the token they moved.
        </div>
      </Card>

      <Card
        title="Where your fees arrive"
        foot="Your Gloam address on each chain, from Receive in the Gloam app. Fees arrive there privately, like any payment to you, and show in that app. No address on a chain: no fee is added there."
      >
        {noAddress && (
          <div className="mb-5">
            <Notice tone="warn">Add a Gloam address on at least one chain, or your fee is never added.</Notice>
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {FEE_CHAINS.map((key) => {
            const value = feeTo[key] ?? "";
            return (
              <Field
                key={key}
                label={getNetwork(key).label}
                htmlFor={`fee-to-${key}`}
                hint={badTag(value) ? <span className="text-danger">Not a Gloam address.</span> : "Starts with gloamr1."}
              >
                <input
                  id={`fee-to-${key}`}
                  className="gl-input tnum text-[14px]"
                  placeholder="gloamr1.…"
                  spellCheck={false}
                  autoComplete="off"
                  value={value}
                  onChange={(e) => setFeeTo((f) => ({ ...f, [key]: e.target.value }))}
                />
              </Field>
            );
          })}
        </div>
      </Card>

      <Card title="Your app">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field label="Name" htmlFor="acct-name">
            <input id="acct-name" className="gl-input" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Website" htmlFor="acct-site">
            <input id="acct-site" className="gl-input" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </Field>
        </div>
      </Card>

      {err && <Notice tone="danger">{err}</Notice>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className="btn btn-ink btn-lg">
          {busy ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span role="status" className="text-[13.5px] text-mute">
            Saved. New payments use this fee.
          </span>
        )}
      </div>
    </form>
  );
}
