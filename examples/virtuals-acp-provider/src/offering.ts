/**
 * The one service this provider offers on ACP: "private payout".
 *
 * A client agent names who to pay and how much. The provider pays each one
 * privately from its Gloam balance and delivers proof of each payment (or a
 * claim link, for someone with no Gloam address). The offering sets
 * requiredFunds, so acp-node-v2 creates the job with ACP's FundTransferHook:
 * the payout total goes to the provider when the client funds, and only the
 * provider's fee sits in ACP's escrow.
 *
 * Requirement (what the client sends with the job), either form:
 *
 *   { "payouts": [{ "to": "gloamr1.…", "amount": "7", "note": "march" },
 *                 { "to": "claim-link", "amount": "3" }],
 *     "replyTo": "gloamr1.…" }
 *
 *   { "sealedPayouts": "gloam2t.…", "replyTo": "gloamr1.…" }
 *
 * The sealed form is the same list sealed to the provider's Gloam address, so
 * Virtuals' ACP backend, which stores the requirement, never reads it.
 * `replyTo` is the client's Gloam address: the deliverable is sealed to it.
 * It is required whenever a payout is a claim link, since a claim link is the
 * money itself. replyTo sits outside the seal, so the backend sees the
 * client's Gloam address (not what it is paid, or whom it pays).
 *
 * Every Gloam address is checked to be a real P-256 key (isReceiveTag) here,
 * before any quote: a tag that only looks right would move money and then fail
 * to seal to its payee.
 */
import { isReceiveTag, sealToReceiveTag } from "@gloamtrade/sdk";

export const OFFERING_NAME = "gloam_private_payout";

export const MAX_PAYOUTS = 20;

/** The registry record a Virtuals developer would publish for this offering (acp-node-v2 AcpAgentOffering). */
export const PRIVATE_PAYOUT_OFFERING = {
  name: OFFERING_NAME,
  description:
    "Private payout: name who to pay and how much; each one is paid privately through Gloam, and the deliverable is a proof of each payment (or a claim link sealed to you). A proof shows each payment was made, not who received it. The payout total reaches the provider when you fund (fund transfer) and the fee sits in escrow, so the job needs an evaluator (yourself). Those legs are public; the payouts are not.",
  requirements: {
    type: "object",
    additionalProperties: false,
    properties: {
      payouts: {
        type: "array",
        minItems: 1,
        maxItems: MAX_PAYOUTS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["to", "amount"],
          properties: {
            to: { type: "string", description: 'A Gloam address (gloamr1.…), or "claim-link" for someone without one.' },
            amount: { type: "string", pattern: "^\\d+(\\.\\d{1,6})?$" },
            note: { type: "string", maxLength: 80 },
          },
        },
      },
      sealedPayouts: { type: "string", pattern: "^gloam2t\\." },
      replyTo: { type: "string", pattern: "^gloamr1\\.", description: "Your Gloam address: the deliverable is sealed to it. It is not itself sealed, so the ACP backend sees it." },
    },
  },
  deliverable: {
    type: "object",
    properties: {
      type: { const: "gloam.private_payout.v1" },
      sealed: { type: "string", description: "The full result sealed to replyTo (gloam2t.…), when replyTo was given." },
      summary: { type: "object" },
    },
  },
  slaMinutes: 30,
  priceType: "fixed",
  requiredFunds: true,
  isHidden: false,
  isPrivate: false,
} as const;

export type PayoutLine = { to: string; amount: string; note?: string };
export type PayoutRequirement = { payouts?: PayoutLine[]; sealedPayouts?: string; replyTo?: string };

export class RequirementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequirementError";
  }
}

const AMOUNT = /^\d+(\.\d{1,6})?$/;

/** Check one payout list (plain or opened from its seal). */
export function checkPayouts(raw: unknown): PayoutLine[] {
  if (!Array.isArray(raw) || raw.length < 1) throw new RequirementError("payouts must list at least one payout.");
  if (raw.length > MAX_PAYOUTS) throw new RequirementError(`At most ${MAX_PAYOUTS} payouts per job.`);
  return raw.map((p, i) => {
    if (!p || typeof p !== "object") throw new RequirementError(`payouts[${i}] is not an object.`);
    const { to, amount, note, ...rest } = p as Record<string, unknown>;
    if (Object.keys(rest).length) throw new RequirementError(`payouts[${i}] has unknown fields: ${Object.keys(rest).join(", ")}.`);
    if (typeof to !== "string" || !(to === "claim-link" || isReceiveTag(to))) {
      throw new RequirementError(`payouts[${i}].to must be a Gloam address (gloamr1.…) or "claim-link".`);
    }
    if (typeof amount !== "string" || !AMOUNT.test(amount) || /^0+(\.0+)?$/.test(amount)) {
      throw new RequirementError(`payouts[${i}].amount must be a positive number with up to 6 decimals, as a string.`);
    }
    if (note !== undefined && (typeof note !== "string" || Array.from(note).length > 80)) {
      throw new RequirementError(`payouts[${i}].note must be text of at most 80 characters.`);
    }
    return { to, amount, ...(note ? { note } : {}) };
  });
}

/** Parse the requirement message. `open` opens a sealed list with the provider's Gloam key. */
export async function parseRequirement(content: string, open: (sealed: string) => Promise<string>): Promise<{ payouts: PayoutLine[]; replyTo: string | null; sealed: boolean }> {
  let req: PayoutRequirement;
  try {
    req = JSON.parse(content) as PayoutRequirement;
  } catch {
    throw new RequirementError("The requirement is not JSON.");
  }
  if (!req || typeof req !== "object") throw new RequirementError("The requirement is not an object.");
  const extra = Object.keys(req).filter((k) => !["payouts", "sealedPayouts", "replyTo"].includes(k));
  if (extra.length) throw new RequirementError(`Unknown requirement fields: ${extra.join(", ")}.`);
  if (req.replyTo !== undefined && !isReceiveTag(req.replyTo)) throw new RequirementError("replyTo must be a Gloam address (gloamr1.…).");
  if (Boolean(req.payouts) === Boolean(req.sealedPayouts)) throw new RequirementError("Send either payouts or sealedPayouts.");
  let payouts: PayoutLine[];
  if (req.sealedPayouts) {
    let plain: string;
    try {
      plain = await open(req.sealedPayouts);
    } catch {
      throw new RequirementError("sealedPayouts is not sealed to this provider's Gloam address.");
    }
    let list: unknown;
    try {
      list = JSON.parse(plain);
    } catch {
      throw new RequirementError("sealedPayouts does not hold a JSON payout list.");
    }
    payouts = checkPayouts(list);
  } else {
    payouts = checkPayouts(req.payouts);
  }
  if (payouts.some((p) => p.to === "claim-link") && !req.replyTo) {
    throw new RequirementError("A claim-link payout needs replyTo (your Gloam address): the link is the money, so it is sealed to you.");
  }
  return { payouts, replyTo: req.replyTo ?? null, sealed: Boolean(req.sealedPayouts) };
}

/** Client side: the requirement for a payout job, the list sealed to the provider when its Gloam address is known. */
export async function buildPayoutRequirement(args: { payouts: PayoutLine[]; providerAddress?: string; replyTo?: string }): Promise<PayoutRequirement> {
  const payouts = checkPayouts(args.payouts);
  const out: PayoutRequirement = args.providerAddress
    ? { sealedPayouts: await sealToReceiveTag(JSON.stringify(payouts), args.providerAddress) }
    : { payouts };
  if (args.replyTo) out.replyTo = args.replyTo;
  return out;
}
