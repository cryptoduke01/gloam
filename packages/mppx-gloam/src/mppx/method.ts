/**
 * The "gloam"/"charge" method definition for mppx: name, intent, and the
 * schemas of the request (route input -> wire request) and of the credential
 * payload. Server and client factories extend it in ./server.ts and ./client.ts.
 */

import { parseUnits } from "viem";
import { Method, z } from "mppx";
import { GLOAM_CHARGE_INTENT, GLOAM_METHOD } from "../charge.js";

const mode = z.enum(["push", "pull"]);

/** What a route passes (plus the server defaults): a display amount and the network terms. */
const RequestInput = z.object({
  /** Price in display units, e.g. "0.01". */
  amount: z.amount(),
  /** Token address (zero address for the native unit). */
  currency: z.address(),
  decimals: z.number(),
  /** The payee receive tag (gloamr1.…). */
  recipient: z.string().check(z.regex(/^gloamr1\.[A-Za-z0-9_-]+$/, "recipient must be a Gloam receive tag")),
  chainId: z.number(),
  pool: z.address(),
  supportedModes: z.optional(z.array(mode)),
  description: z.optional(z.string()),
  externalId: z.optional(z.string()),
});

const Transfer = z.object({
  proof: z.signature(),
  root: z.hash(),
  nullifier: z.hash(),
  newCommitments: z.tuple([z.hash(), z.hash()]),
});

const Payload = z.union([
  z.object({ type: z.literal("hash"), hash: z.hash(), ticket: z.string(), binding: z.string() }),
  z.object({ type: z.literal("transfer"), transfer: Transfer, ticket: z.string(), binding: z.string() }),
]);

export const charge = Method.from({
  name: GLOAM_METHOD,
  intent: GLOAM_CHARGE_INTENT,
  schema: {
    credential: { payload: Payload },
    request: z.pipe(
      RequestInput,
      z.transform(({ amount, chainId, decimals, pool, supportedModes, ...rest }) => ({
        ...rest,
        amount: parseUnits(amount, decimals).toString(),
        methodDetails: {
          chainId,
          pool,
          decimals,
          ...(supportedModes && supportedModes.length < 2 ? { supportedModes } : {}),
        },
      }))
    ),
  },
});
