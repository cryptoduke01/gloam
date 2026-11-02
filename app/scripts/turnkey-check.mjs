#!/usr/bin/env node
/**
 * Checks Turnkey's dashboard setup for Gloam wallets before NEXT_PUBLIC_TURNKEY_ENABLED
 * is turned on (DEPLOY-TURNKEY.md). Needs no secret: it asks Turnkey's auth proxy
 * for the wallet kit config the way each site's browser does, and says what came back.
 *
 * The sign-in error this guards against: the auth proxy answers "403 origin not
 * allowed" to any origin missing from the config's Allowed Origins. Turnkey's kit
 * (2.2.0) then fails to start without a word, and its sheet only says "An
 * underlying error occurred". That is what passkey sign-in showed on gloam.trade.
 *
 * Run from app/:
 *   NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID=... NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID=... node scripts/turnkey-check.mjs [extra origins...]
 *
 * Exits 1 when the production origins are refused, or email or passkey is off.
 */
const AUTH_PROXY = process.env.TURNKEY_AUTH_PROXY_URL || "https://authproxy.turnkey.com";
const configId = process.env.NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID?.trim();
const orgId = process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID?.trim();

/** Where the app runs: production must pass; localhost is for development only. */
const REQUIRED = ["https://www.gloam.trade", "https://gloam.trade"];
const OPTIONAL = ["http://localhost:3000"];
const extra = process.argv.slice(2).filter((a) => /^https?:\/\/[^/]+$/.test(a));

if (!configId) {
  console.error("Set NEXT_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID (Embedded Wallets > Configuration in the Turnkey dashboard).");
  process.exit(1);
}

async function ask(origin) {
  try {
    const res = await fetch(`${AUTH_PROXY}/v1/wallet_kit_config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Proxy-Config-ID": configId, Origin: origin },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, why: `${res.status} ${text.trim().slice(0, 120)}` };
    return { ok: true, config: JSON.parse(text) };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

let failed = false;
for (const origin of [...REQUIRED, ...OPTIONAL, ...extra]) {
  const required = REQUIRED.includes(origin) || extra.includes(origin);
  const r = await ask(origin);
  if (!r.ok) {
    console.log(`${required ? "FAIL" : "note"}  ${origin}: refused (${r.why}). Add it to Allowed Origins.`);
    if (required) failed = true;
    continue;
  }
  const c = r.config;
  const providers = Array.isArray(c.enabledProviders) ? c.enabledProviders : [];
  const missing = ["email", "passkey"].filter((p) => !providers.includes(p));
  const wrongOrg = orgId && c.organizationId && c.organizationId !== orgId;
  const line = `${origin}: allowed. Sign-in methods: ${providers.join(", ") || "none"}. Session: ${c.sessionExpirationSeconds ?? "?"} s. OTP: ${c.otpLength ?? "?"} ${c.otpAlphanumeric ? "letters and digits" : "digits"}.`;
  if (missing.length || wrongOrg) {
    console.log(`FAIL  ${line}`);
    if (missing.length) console.log(`      Turn on ${missing.join(" and ")} in Embedded Wallets > Configuration.`);
    if (wrongOrg) console.log(`      This config belongs to organization ${c.organizationId}, not ${orgId}.`);
    failed = true;
  } else {
    console.log(`ok    ${line}`);
  }
}

if (failed) {
  console.log("\nNot ready: leave NEXT_PUBLIC_TURNKEY_ENABLED off until every FAIL line is fixed.");
  process.exit(1);
}
console.log("\nThe auth proxy answers every production origin with email and passkey on.");
