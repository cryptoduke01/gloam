"use client";

/**
 * Simple step diagram for docs/whitepaper — plain labels, brand lime accents.
 */

export type FlowStep = {
  n: string;
  title: string;
  body: string;
};

export function FlowDiagram({
  title,
  subtitle,
  steps,
}: {
  title: string;
  subtitle?: string;
  steps: FlowStep[];
}) {
  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
          {title}
        </p>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>

      {/* Desktop */}
      <div className="hidden gap-0 md:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((s, i) => (
          <div
            key={s.n}
            className={`relative px-5 py-6 ${i < steps.length - 1 ? "border-r border-line" : ""}`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-lime/40 bg-lime/10 font-mono text-sm font-semibold text-lime">
              {s.n}
            </div>
            <p className="mt-4 font-display text-lg text-foreground">{s.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
            {i < steps.length - 1 && (
              <span
                className="absolute -right-2 top-10 z-10 hidden text-lime md:block"
                aria-hidden
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Mobile stack */}
      <ol className="divide-y divide-line md:hidden">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-4 px-5 py-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-lime/40 bg-lime/10 font-mono text-xs font-semibold text-lime">
              {s.n}
            </div>
            <div>
              <p className="font-display text-lg text-foreground">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-mute">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PoolPicture({
  title = "Where your money sits",
}: {
  title?: string;
}) {
  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
          {title}
        </p>
      </div>
      <div className="grid gap-0 sm:grid-cols-3">
        <div className="border-b border-line px-5 py-6 sm:border-b-0 sm:border-r">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
            Your wallet
          </p>
          <p className="mt-3 font-display text-xl text-foreground">Open</p>
          <p className="mt-2 text-sm text-mute">
            Anyone can see the balance if they know the address.
          </p>
        </div>
        <div className="border-b border-line bg-lime/5 px-5 py-6 sm:border-b-0 sm:border-r">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-lime">
            Gloam pool
          </p>
          <p className="mt-3 font-display text-xl text-foreground">Shielded</p>
          <p className="mt-2 text-sm text-mute">
            Money is in the shared vault. You hold a private note that proves
            it&apos;s yours.
          </p>
        </div>
        <div className="px-5 py-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
            After unshield
          </p>
          <p className="mt-3 font-display text-xl text-foreground">Open again</p>
          <p className="mt-2 text-sm text-mute">
            Exit is public on purpose — money leaves the vault back to a wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
