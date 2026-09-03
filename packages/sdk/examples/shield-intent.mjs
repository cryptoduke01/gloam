/**
 * Build an unsigned shield intent with @gloamtrade/sdk.
 *
 *   pnpm --filter @gloamtrade/sdk build
 *   node examples/shield-intent.mjs
 *
 * Prints a ready-to-sign shield of 0.01 ETH into the sealed vault: a real
 * Poseidon note commitment plus the exec args for shield(asset, amount,
 * commitment). Persist note.secret to spend the note later. No chain call here.
 */
import { buildShieldIntent } from "../dist/index.js";

const intent = await buildShieldIntent({ amountWei: 10_000_000_000_000_000n }); // 0.01 ETH

// Do not print the secret in real usage; shown here to illustrate the note.
console.log(
  JSON.stringify(
    {
      intent: intent.intent,
      chainId: intent.chainId,
      plan: { ...intent.plan, amountWei: intent.plan.amountWei?.toString() },
      privacy: intent.privacy,
      execution: intent.execution,
      exec: {
        poolAddress: intent.exec.poolAddress,
        fn: intent.exec.fn,
        valueWei: intent.exec.valueWei.toString(),
        args: intent.exec.args.map((a) => (typeof a === "bigint" ? a.toString() : a)),
      },
      note: { commitment: intent.note.commitment, nullifier: intent.note.nullifier },
    },
    null,
    2
  )
);
