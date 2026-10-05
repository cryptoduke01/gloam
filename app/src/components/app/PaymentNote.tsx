/**
 * The payer's private note on a payment ("Invoice 042", lib/paymentNote), as
 * it shows wherever a received payment is listed. Only this browser has it: it
 * came sealed inside the payment and is kept with the balance, encrypted.
 */

/** A small note mark: a card with two lines of text. */
export function NoteGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4.5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.9" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/** One line: the note mark and the note, truncated to fit (the full note is in the title). */
export function PaymentNoteLine({
  note,
  label = "Note",
  className = "",
}: {
  note: string;
  /** Read out before the note, for screen readers. */
  label?: string;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 ${className}`} title={note}>
      <span className="shrink-0 text-mute">
        <NoteGlyph />
      </span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 truncate">{note}</span>
    </span>
  );
}
