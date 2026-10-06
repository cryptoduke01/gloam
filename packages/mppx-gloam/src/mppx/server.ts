/**
 * Server side of the gloam method for mppx.
 *
 *   import { Mppx } from "mppx/server"
 *   import { gloam } from "@gloamtrade/mppx-gloam/server"
 *
 *   const mppx = Mppx.create({
 *     secretKey: process.env.MPP_SECRET_KEY!,
 *     methods: [gloam({ receiveKey, chain, prove, submit, network: "tempo" })],
 *   })
 *   const r = await mppx.charge({ amount: "0.01" })(request)
 *   if (r.status === 402) return r.challenge
 *   return r.withReceipt(Response.json(data))
 *
 * mppx checks the challenge HMAC, expiry and route binding; `validate` checks
 * the gloam payment read-only and `broadcast` sweeps it and returns the receipt.
 */

import type { Address } from "viem";
import { Errors, Method, Receipt } from "mppx";
import {
  assetDecimals,
  chargeTerms,
  officialPool,
  resolveNetwork,
  GloamChargeError,
  GLOAM_CHARGE_INTENT,
  GLOAM_METHOD,
  GLOAM_MODES,
  type GloamChargeRequest,
} from "../charge.js";
import { settleGloamCharge, validateGloamCharge, type GloamChargeServerConfig, type ValidatedGloamCharge } from "../server.js";
import { charge } from "./method.js";

/** Translate a gloam failure into the mppx error that answers with the right Problem Details. */
export function toMppxError(e: unknown, challengeId?: string): Error {
  if (e instanceof Errors.PaymentError) return e;
  // mppx ends the problem detail with its own period.
  const reason = (e instanceof Error ? e.message : String(e)).replace(/\.$/, "");
  if (e instanceof GloamChargeError) {
    switch (e.code) {
      case "payment-expired":
        return new Errors.PaymentExpiredError({});
      case "invalid-payload":
        return new Errors.InvalidPayloadError({ reason });
      case "invalid-challenge":
        return new Errors.InvalidChallengeError({ id: challengeId, reason });
      default:
        return new Errors.VerificationFailedError({ reason, details: { retryable: e.retryable } });
    }
  }
  return new Errors.VerificationFailedError({ reason });
}

export declare namespace gloam {
  type Parameters = GloamChargeServerConfig &
    Method.ComposableHooks<typeof charge> & {
      /** "tempo" (default), "robinhood", or a chain id. */
      network?: "tempo" | "robinhood" | number;
      /** Token address; default PathUSD on Tempo, native ETH on Robinhood Chain. */
      currency?: Address;
      /** Decimals of `currency`, to read route amounts. Default 6 for PathUSD, 18 for ETH. */
      decimals?: number;
    };
}

/** Request fields the method fills in, so a route only passes `{ amount }`. */
export type GloamServerDefaults = {
  chainId: number;
  pool: Address;
  currency: Address;
  decimals: number;
  recipient: string;
  supportedModes?: ("push" | "pull")[];
};

/** The configured server method (what `Mppx.create` takes). */
export type GloamServerMethod = Method.Server<typeof charge, GloamServerDefaults, undefined, {}, undefined>;

/** A gloam charge method for `Mppx.create({ methods: [...] })`. Routes pass `{ amount: "0.01" }`. */
export function gloam(parameters: gloam.Parameters): GloamServerMethod {
  const { network, currency, decimals, canOffer, onPaymentSuccess, ...config } = parameters;
  const net = resolveNetwork(network);
  const pool = officialPool(net.chainId, config.pools);
  if (!pool) throw new Error(`There is no Gloam pool on chain ${net.chainId}.`);
  const modes = config.modes ?? GLOAM_MODES;
  const asset = currency ?? net.currency;
  const assetDec = decimals ?? assetDecimals(asset);
  if (assetDec === undefined) throw new Error(`Pass decimals for currency ${asset}.`);
  // validate and broadcast receive the same credential object; carry the opened payment between them.
  const validated = new WeakMap<object, ValidatedGloamCharge>();

  return Method.toServer(charge, {
    canOffer,
    onPaymentSuccess,
    defaults: {
      chainId: net.chainId,
      pool,
      currency: asset,
      decimals: assetDec,
      recipient: config.receiveKey.tag,
      ...(modes.length < GLOAM_MODES.length ? { supportedModes: [...modes] } : {}),
    } as GloamServerDefaults,
    stableBinding: (request) => chargeTerms(request as unknown as GloamChargeRequest),
    async validate({ credential }) {
      try {
        const v = await validateGloamCharge({ challenge: credential.challenge, payload: credential.payload, config });
        validated.set(credential, v);
        return {
          challenge: credential.challenge,
          credential,
          details: { mode: v.mode, amount: v.request.amount, currency: v.request.currency, chainId: v.request.methodDetails.chainId },
          intent: GLOAM_CHARGE_INTENT,
          method: GLOAM_METHOD,
          request: credential.challenge.request,
        };
      } catch (e) {
        throw toMppxError(e, credential.challenge.id);
      }
    },
    async broadcast({ credential }) {
      try {
        const receipt = await settleGloamCharge({
          challenge: credential.challenge,
          payload: credential.payload,
          config,
          validated: validated.get(credential),
        });
        return Receipt.from(receipt);
      } catch (e) {
        throw toMppxError(e, credential.challenge.id);
      } finally {
        validated.delete(credential);
      }
    },
  });
}

/** Same factory, mppx style: `gloam.charge({...})`. */
gloam.charge = gloam;
