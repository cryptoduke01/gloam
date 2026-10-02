import { SealDots } from "@/components/ui/SealDots";
import styles from "./landing.module.css";

const PAYMENTS = [
  { who: "Yomi", what: "Salary", amt: "4,800", cur: "USDG" },
  { who: "Kris", what: "Invoice 0142", amt: "1,250", cur: "PathUSD" },
  { who: "Romeo", what: "Contractor", amt: "3,600", cur: "USDG" },
  { who: "Research agent", what: "API calls", amt: "0.42", cur: "PathUSD" },
  { who: "Robin", what: "Salary", amt: "4,200", cur: "USDG" },
  { who: "Supplier", what: "Order 88", amt: "18,900", cur: "USDG" },
  { who: "Duke", what: "Salary", amt: "6,000", cur: "USDG" },
];

function Readable({ p }: { p: (typeof PAYMENTS)[number] }) {
  return (
    <div className={styles.card}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-mute">{p.what}</span>
        <span className="text-[12px] text-faint">Public chain</span>
      </div>
      <div>
        <p className="text-[15px] text-foreground">To {p.who}</p>
        <p className="tnum mt-1 text-[26px] font-light leading-none tracking-[-0.02em] text-foreground">
          {p.amt} <span className="text-[14px] text-mute">{p.cur}</span>
        </p>
      </div>
    </div>
  );
}

function Sealed() {
  return (
    <div className={styles.card}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-mute">Private transfer</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sealed">
          <span className="h-1.5 w-1.5 rounded-full bg-sealed" />
          Sealed
        </span>
      </div>
      <div>
        <p className="text-[15px] text-foreground">
          To <SealDots n={5} className="ml-1 text-foreground/70" label="Recipient hidden" />
        </p>
        <p className="mt-2.5 text-foreground/70">
          <SealDots n={7} />
        </p>
      </div>
    </div>
  );
}

/** The signature: payments enter readable and leave sealed. */
export function SealStream() {
  const loop = [...PAYMENTS, ...PAYMENTS];
  return (
    <div className={styles.stream} aria-label="Payments going in readable and coming out sealed">
      <div className={`${styles.half} ${styles.readable}`} aria-hidden>
        <div className={`${styles.track} ${styles.move}`}>
          {loop.map((p, i) => (
            <Readable key={i} p={p} />
          ))}
        </div>
      </div>
      <div className={`${styles.half} ${styles.sealed}`} aria-hidden>
        <div className={`${styles.track} ${styles.move}`}>
          {loop.map((_, i) => (
            <Sealed key={i} />
          ))}
        </div>
      </div>
      <div className={styles.slab} aria-hidden>
        <div className={styles.slabGlow} />
      </div>
    </div>
  );
}
