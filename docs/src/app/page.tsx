export default function DocsHome() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <p className="text-sm font-medium text-lime">docs.gloam.trade</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Gloam Docs</h1>
      <p className="mt-4 text-mute leading-relaxed">
        Private money on Robinhood Chain. Docs scaffold — protocol, privacy
        model, and app guides land here as we build.
      </p>
      <ul className="mt-10 space-y-3 text-sm text-mute">
        <li>· What is Gloam</li>
        <li>· Robinhood Chain setup</li>
        <li>· Shield / transfer / trade (coming)</li>
        <li>· Security &amp; threat model (coming)</li>
      </ul>
    </main>
  );
}
