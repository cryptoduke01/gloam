/**
 * VEYA's budget check before a payment (optional, off by default).
 *
 * A Gloam note is spent with a proof, so wallet rules can't stop a payment: a
 * budget only holds before the payment, on the server that keeps the notes. With
 * GLOAM_VEYA_KEY set, every 402 this server is about to pay goes to VEYA first,
 * and the payment goes ahead only on an exact allow.
 *
 * What is sent: the operator's opaque agent id, the chain, the asset, the amount,
 * the payee, the resource's host and the payment request, with the key as a
 * bearer token. Nothing else: never a note, a secret, a balance, a wallet or a
 * signing key.
 *
 * It fails closed. A refuse, an answer this code does not know, an HTTP error, a
 * body that is not JSON, no answer within the timeout, or a setting that is
 * missing or unusable all mean: do not pay. VEYA's reason is untrusted text, so
 * only a stripped, capped copy of it goes any further.
 *
 * VEYA is never told how a payment it allowed ended, so if one fails afterwards
 * its running budget can sit ahead of what was really paid.
 *
 * VEYA's real endpoint has not arrived yet. Its format is veyaRequest and
 * readAnswer below and nowhere else, so a change to it stays in those two.
 */
import { guardBody, guardTimeoutMs, keyMayGoTo, plainText, postToGuard, type GuardEndpoint } from "./guardCall.js";

type Env = Record<string, string | undefined>;

export const VEYA_TIMEOUT_MS = 5_000;

export interface VeyaConfig extends GuardEndpoint {
  agentId: string;
}

/** The payment being checked. */
export interface VeyaPayment {
  chainId: number;
  asset: string;
  amountWei: bigint;
  /** The requirement's payTo. */
  payee: string;
  /** The host the payment is for, or null when the payment request names none. */
  resourceHost: string | null;
  /** The decoded payment request, the same text Agent Wormhole reads. */
  content: string;
}

export type VeyaOutcome =
  | { pay: true; decision: "allow" }
  | {
      pay: false;
      /** "refuse" only when VEYA said so; "unchecked" for everything that is not an answer. */
      decision: "refuse" | "unchecked";
      /** VEYA's reason, stripped and capped. */
      reason: string | null;
      /** One line for the agent: plain, says not to pay. */
      message: string;
    };

// ── VEYA's format ─────────────────────────────────────────────────────────────

/** POST <GLOAM_VEYA_URL>. `amount` is base units as a decimal string, whatever form the price wrote it in. */
function veyaRequest(agentId: string, p: VeyaPayment) {
  return {
    agent_id: agentId,
    chain_id: p.chainId,
    asset: p.asset,
    amount: p.amountWei.toString(),
    payee: p.payee,
    resource_host: p.resourceHost,
    content: p.content,
  };
}

/** The only HTTP status that can carry an answer. */
const ANSWER_STATUS = 200;

/** {"decision": "allow" | "refuse", "reason"?: string}. Only an exact allow pays; null is not an answer. */
function readAnswer(body: Record<string, unknown> | null): { allow: true } | { allow: false; reason: string | null } | null {
  if (!body) return null;
  if (body.decision === "allow") return { allow: true };
  if (body.decision === "refuse") return { allow: false, reason: plainText(body.reason) || null };
  return null;
}

// ── the check ─────────────────────────────────────────────────────────────────

/** A wallet address anywhere in the value, with or without 0x. A private key is longer and matches too. */
const WALLET_SHAPED = /(?:0x)?[0-9a-f]{40}/i;

/**
 * Off (null) unless GLOAM_VEYA_KEY is set. A key with an unusable GLOAM_VEYA_URL
 * or GLOAM_VEYA_AGENT_ID is an error, so a typo can't quietly turn the check off.
 * The errors name the setting and never repeat its value.
 */
export function veyaConfig(env: Env): VeyaConfig | { error: string } | null {
  const key = env.GLOAM_VEYA_KEY?.trim();
  if (!key) return null;
  const raw = env.GLOAM_VEYA_URL?.trim();
  if (!raw) return { error: "GLOAM_VEYA_URL is not set." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "GLOAM_VEYA_URL is not a URL." };
  }
  if (!keyMayGoTo(url)) return { error: `GLOAM_VEYA_URL must be https (or http on localhost), not ${url.protocol}//${url.host}.` };
  const agentId = env.GLOAM_VEYA_AGENT_ID?.trim();
  if (!agentId) return { error: "GLOAM_VEYA_AGENT_ID is not set." };
  if (WALLET_SHAPED.test(agentId)) return { error: "GLOAM_VEYA_AGENT_ID looks like a wallet address. Set an opaque id, so a wallet never goes out as the id." };
  return { key, url: url.toString(), timeoutMs: guardTimeoutMs(env.GLOAM_VEYA_TIMEOUT_MS, VEYA_TIMEOUT_MS), agentId };
}

/**
 * Check a payment against the agent's budget before paying it. Returns null when
 * the check is off, else whether to pay. Never throws.
 */
export async function checkVeyaBudget(payment: VeyaPayment, env: Env, fetchImpl: typeof fetch = fetch): Promise<VeyaOutcome | null> {
  const config = veyaConfig(env);
  if (config === null) return null;
  const refuse = (why: string, decision: "refuse" | "unchecked" = "unchecked", reason: string | null = null): VeyaOutcome => ({
    pay: false,
    decision,
    reason,
    message: `${why} Not paying.`,
  });
  if ("error" in config) return refuse(`The VEYA check is on but misconfigured: ${config.error}`);

  const call = await postToGuard(config, veyaRequest(config.agentId, payment), fetchImpl);
  if ("failed" in call) {
    return refuse(call.failed === "timeout" ? `VEYA did not answer within ${config.timeoutMs / 1000}s.` : "VEYA could not be reached.");
  }
  if (call.res.status !== ANSWER_STATUS) return refuse(`VEYA answered HTTP ${call.res.status}, so the budget was not checked.`);

  const answer = readAnswer(await guardBody(call.res));
  if (!answer) return refuse("VEYA's answer was not an allow or a refuse, so the budget was not checked.");
  if (!answer.allow) {
    return refuse(answer.reason ? `VEYA refused this payment (${answer.reason}).` : "VEYA refused this payment.", "refuse", answer.reason);
  }
  return { pay: true, decision: "allow" };
}
