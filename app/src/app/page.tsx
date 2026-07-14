export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex max-w-lg flex-col items-center gap-6 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-lime"
          aria-hidden
        >
          <span className="relative block h-10 w-10">
            <span className="absolute inset-0 rounded-full border-[6px] border-ink border-r-transparent" />
            <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-white">
            Gloam
          </h1>
          <p className="text-lg text-mute">
            Trade and move money privately onchain.
          </p>
          <p className="text-sm text-mute">Robinhood Chain · app.gloam.trade</p>
        </div>
        <p className="rounded-full border border-white/10 px-4 py-2 font-mono text-xs text-mute">
          Scaffold live · privacy rails next
        </p>
      </div>
    </main>
  );
}
