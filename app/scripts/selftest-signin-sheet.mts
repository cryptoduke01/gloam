/**
 * Self-test: Gloam's sign-in sheet (lib/signInSheet, drawn by
 * components/app/GloamSignInSheet).
 *
 *  - the steps: email, code, back; one request at a time; a code being checked
 *    can't be walked away from, and the sheet can't close mid-check or mid-passkey
 *  - the code field: digits only, paste replaces, spaces and dashes dropped,
 *    full-width digits read, cut to length, the length from the auth proxy config
 *  - the email check, and the email kept as typed (trimmed, never lowercased)
 *  - resend: a 30 second wait, open at once for a spent code, restarted by a rate limit
 *  - failures read in plain words, never the SDK's own text
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-signin-sheet.mts
 */
import assert from "node:assert/strict";
import {
  DEFAULT_OTP_FORMAT,
  RESEND_COOLDOWN_MS,
  SIGN_IN_START,
  canClose,
  canResend,
  cleanEmail,
  cleanOtp,
  emailProblem,
  needsNewCode,
  otpAfterPaste,
  otpComplete,
  otpFormat,
  resendSecondsLeft,
  signInError,
  signInErrorKind,
  signInReducer,
  type SignInState,
} from "../src/lib/signInSheet";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

/** A TurnkeyError-shaped error wrapping the SDK's own, as the kit throws them. */
function tk(code: string, message: string, cause?: unknown) {
  return Object.assign(new Error(message), { name: "TurnkeyError", code, cause });
}

const T0 = 1_000_000;
const sent = (s: SignInState = SIGN_IN_START) =>
  signInReducer(signInReducer(s, { type: "send" }), { type: "sent", email: "a@b.co", otpId: "otp1", bundle: "b1", at: T0 });

test("email, then the code, then back to the email", () => {
  let s = signInReducer(SIGN_IN_START, { type: "send" });
  assert.deepEqual(s, { kind: "start", busy: "send", error: null });
  // one request at a time
  assert.equal(signInReducer(s, { type: "send" }), s);
  assert.equal(signInReducer(s, { type: "passkey", mode: "login" }), s);
  s = signInReducer(s, { type: "sent", email: "a@b.co", otpId: "otp1", bundle: "b1", at: T0 });
  assert.equal(s.kind, "code");
  assert.ok(s.kind === "code" && s.email === "a@b.co" && s.otpId === "otp1" && !s.resent && s.busy === null);
  assert.deepEqual(signInReducer(s, { type: "back" }), SIGN_IN_START);
});

test("an answer that comes back after Back is dropped", () => {
  const resending = signInReducer(sent(), { type: "resend" });
  const back = signInReducer(resending, { type: "back" });
  assert.deepEqual(back, SIGN_IN_START);
  assert.deepEqual(signInReducer(back, { type: "sent", email: "a@b.co", otpId: "late", bundle: "x", at: T0 }), SIGN_IN_START);
  assert.deepEqual(signInReducer(back, { type: "sendFailed", error: signInError(new Error("x"), "send"), at: T0 }), SIGN_IN_START);
  // and a code step with nothing in flight ignores a stray answer too
  const idle = sent();
  assert.equal(signInReducer(idle, { type: "sent", email: "a@b.co", otpId: "late", bundle: "x", at: T0 + 1 }), idle);
});

test("a code that doesn't send stays on the email step and says why", () => {
  const s = signInReducer(signInReducer(SIGN_IN_START, { type: "send" }), {
    type: "sendFailed",
    error: signInError(new TypeError("Failed to fetch"), "send"),
    at: T0,
  });
  assert.equal(s.kind, "start");
  assert.equal(s.error?.kind, "network");
  assert.equal(s.error?.during, "send");
  // trying again clears it
  assert.equal(signInReducer(s, { type: "send" }).error, null);
});

test("checking a code: busy, then a wrong code says so and lets them retype", () => {
  let s = signInReducer(sent(), { type: "verify" });
  assert.ok(s.kind === "code" && s.busy === "verify");
  assert.equal(signInReducer(s, { type: "verify" }), s, "never checked twice at once");
  assert.equal(signInReducer(s, { type: "back" }), s, "no walking away mid-check");
  assert.equal(canClose(s), false, "no closing mid-check");
  s = signInReducer(s, { type: "verifyFailed", error: signInError(tk("INVALID_OTP_CODE", "The provided OTP code is invalid."), "verify") });
  assert.ok(s.kind === "code" && s.busy === null && s.error?.kind === "wrong-code");
  assert.equal(canClose(s), true);
  assert.equal(signInReducer(s, { type: "verify" }).error, null);
});

test("a passkey prompt holds the sheet open until it ends", () => {
  const s = signInReducer(SIGN_IN_START, { type: "passkey", mode: "signup" });
  assert.equal(s.kind === "start" && s.busy, "passkey-signup");
  assert.equal(canClose(s), false);
  const f = signInReducer(s, { type: "passkeyFailed", error: signInError(new DOMException("The operation either timed out or was not allowed.", "NotAllowedError"), "passkey-signup") });
  assert.equal(f.error?.kind, "cancelled");
  assert.equal(f.error?.text, "The passkey prompt closed. Nothing was made.");
  assert.equal(canClose(f), true);
  assert.equal(canClose(SIGN_IN_START), true);
});

test("the code field keeps digits only, and a paste replaces the code", () => {
  const f = DEFAULT_OTP_FORMAT;
  assert.deepEqual(f, { length: 6, alphanumeric: false });
  assert.equal(cleanOtp("12a3 4-5", f), "12345");
  assert.equal(cleanOtp("123 456", f), "123456");
  assert.equal(cleanOtp("123-456-789", f), "123456");
  assert.equal(cleanOtp("１２３４５６", f), "123456", "full-width digits");
  assert.equal(cleanOtp("abc", f), "");
  assert.equal(cleanOtp("Your code is 482913.", f), "482913");
  assert.equal(otpAfterPaste("12", " 654 321 ", f), "654321", "a paste into a half-typed field replaces it");
  assert.equal(otpAfterPaste("12", "hello", f), "12", "a paste with no digits changes nothing");
  assert.equal(otpAfterPaste("", "98765", f), "98765");
  assert.equal(otpComplete("123456", f), true);
  assert.equal(otpComplete("12345", f), false);
  assert.equal(otpComplete("12345a", f), false);
});

test("the code's shape comes from the auth proxy config, 6 digits when it says nothing", () => {
  assert.deepEqual(otpFormat(undefined), { length: 6, alphanumeric: false });
  assert.deepEqual(otpFormat({ otpLength: "6", otpAlphanumeric: false }), { length: 6, alphanumeric: false });
  assert.deepEqual(otpFormat({ otpLength: "8", otpAlphanumeric: true }), { length: 8, alphanumeric: true });
  assert.deepEqual(otpFormat({ otpLength: "nope" }), { length: 6, alphanumeric: false });
  assert.deepEqual(otpFormat({ otpLength: "99" }), { length: 6, alphanumeric: false });
  const alnum = otpFormat({ otpLength: "6", otpAlphanumeric: true });
  assert.equal(cleanOtp("ab-12 cD", alnum), "ab12cD", "letters kept as typed for a letter code");
});

test("the email is checked, and kept as typed", () => {
  assert.equal(emailProblem(""), "Enter your email.");
  assert.equal(emailProblem("   "), "Enter your email.");
  for (const bad of ["duke", "duke@", "@gloam.trade", "duke@gloam", "du ke@gloam.trade", "duke@gloam.t", "duke@@gloam.trade", "duke@.trade"])
    assert.ok(emailProblem(bad), bad);
  for (const ok of ["duke@gloam.trade", " Duke.Smith+pay@Mail.Example.co.uk ", "a@b.co"]) assert.equal(emailProblem(ok), null, ok);
  // the auth proxy matches the email as it was first given: never lowercased
  assert.equal(cleanEmail("  Duke@Gloam.trade "), "Duke@Gloam.trade");
});

test("resend waits 30 seconds, then opens", () => {
  assert.equal(RESEND_COOLDOWN_MS, 30_000);
  assert.equal(resendSecondsLeft(T0, T0), 30);
  assert.equal(resendSecondsLeft(T0, T0 + 100), 30);
  assert.equal(resendSecondsLeft(T0, T0 + 29_001), 1);
  assert.equal(resendSecondsLeft(T0, T0 + 30_000), 0);
  assert.equal(resendSecondsLeft(T0, T0 + 99_000), 0);
  const s = sent();
  assert.equal(canResend(s, T0 + 10_000), false);
  assert.equal(canResend(s, T0 + 30_000), true);
  assert.equal(canResend(SIGN_IN_START, T0 + 99_000), false);
  // a resend in flight can't be doubled
  const r = signInReducer(s, { type: "resend" });
  assert.equal(canResend(r, T0 + 99_000), false);
  const again = signInReducer(r, { type: "sent", email: "a@b.co", otpId: "otp2", bundle: "b2", at: T0 + 40_000 });
  assert.ok(again.kind === "code" && again.otpId === "otp2" && again.resent && again.sentAt === T0 + 40_000);
  assert.equal(canResend(again, T0 + 50_000), false, "the wait starts over");
});

test("a spent code opens resend at once, and a rate limit starts the wait over", () => {
  const s = sent();
  const expired = signInReducer(signInReducer(s, { type: "verify" }), {
    type: "verifyFailed",
    error: signInError(tk("OTP_COMPLETION_ERROR", "Failed to complete OTP", new Error("Turnkey error 3: OTP has expired")), "verify"),
  });
  assert.equal(expired.error?.kind, "expired-code");
  assert.ok(needsNewCode(expired.error?.kind));
  assert.equal(canResend(expired, T0 + 1_000), true);
  const used = signInError(new Error("Turnkey error 9: max number of attempts exceeded for this OTP"), "verify");
  assert.equal(used.kind, "used-up-code");
  assert.ok(needsNewCode(used.kind));
  assert.ok(!needsNewCode("wrong-code"));

  const limited = signInReducer(signInReducer(s, { type: "resend" }), {
    type: "sendFailed",
    error: signInError(tk("MAX_OTP_INITIATED_ERROR", "Maximum number of OTPs has been reached for this contact."), "send"),
    at: T0 + 35_000,
  });
  assert.ok(limited.kind === "code" && limited.error?.kind === "rate-limit" && limited.sentAt === T0 + 35_000);
  assert.equal(canResend(limited, T0 + 40_000), false);
  assert.equal(limited.kind === "code" && limited.otpId, "otp1", "the code already sent still works");
});

test("failures are read from the kit's codes, its wrapped errors, and their words", () => {
  const k = signInErrorKind;
  assert.equal(k(tk("INVALID_OTP_CODE", "x"), "verify"), "wrong-code");
  assert.equal(k(tk("OTP_COMPLETION_ERROR", "Failed to complete OTP", tk("INVALID_OTP_CODE", "The provided OTP code is invalid.")), "verify"), "wrong-code");
  assert.equal(k(tk("MAX_OTP_INITIATED_ERROR", "x"), "send"), "rate-limit");
  assert.equal(k(new Error("429 Too Many Requests"), "send"), "rate-limit");
  assert.equal(k(Object.assign(new Error("x"), { statusCode: 429 }), "send"), "rate-limit");
  assert.equal(k(Object.assign(new Error("Turnkey error 8: slow down"), { name: "TurnkeyRequestError", code: 8 }), "send"), "rate-limit");
  assert.equal(k(tk("INIT_OTP_ERROR", "Failed to initialize OTP", new Error("Turnkey error 8: rate limit exceeded")), "send"), "rate-limit");
  assert.equal(k(tk("SELECT_PASSKEY_CANCELLED", "Passkey creation was cancelled by the user."), "passkey-signup"), "cancelled");
  assert.equal(k(tk("PASSKEY_LOGIN_AUTH_ERROR", "Failed", new DOMException("The operation either timed out or was not allowed.", "NotAllowedError")), "passkey-login"), "cancelled");
  assert.equal(k(tk("PASSKEY_LOGIN_AUTH_ERROR", "Failed", new Error("Turnkey error 5: organization not found")), "passkey-login"), "no-account");
  assert.equal(k(tk("CLIENT_NOT_INITIALIZED", "Client is not initialized."), "send"), "not-ready");
  assert.equal(k(tk("INIT_OTP_ERROR", "Failed to initialize OTP", new TypeError("Failed to fetch")), "send"), "network");
  assert.equal(k(new TypeError("Load failed"), "verify"), "network");
  assert.equal(k(Object.assign(new Error("x"), { statusCode: 503 }), "send"), "network");
  assert.equal(k(tk("UNKNOWN", "boom"), "verify"), "unknown");
  // a wrong code only counts as one while a code is in play
  assert.equal(k(tk("INVALID_OTP_CODE", "x"), "passkey-login"), "unknown");
  assert.equal(k(null, "send"), "unknown");
  assert.equal(k("Failed to fetch", "send"), "network");
});

test("every failure reads in plain words, never the SDK's own text", () => {
  const cases: [unknown, Parameters<typeof signInError>[1], RegExp][] = [
    [tk("INVALID_OTP_CODE", "x"), "verify", /didn't match/],
    [new Error("OTP has expired"), "verify", /expired\. Send a new one/],
    [tk("MAX_OTP_INITIATED_ERROR", "x"), "send", /Too many codes sent to this email/],
    [new Error("429"), "verify", /Too many tries/],
    [new TypeError("Failed to fetch"), "send", /Couldn't reach the sign-in service/],
    [tk("SELECT_PASSKEY_CANCELLED", "x"), "passkey-login", /passkey prompt closed/],
    [new Error("organization not found"), "passkey-login", /No Gloam account uses that passkey/],
    [tk("UNKNOWN", "Turnkey error 13: internal"), "send", /^Couldn't send a code\. Try again\.$/],
    [tk("UNKNOWN", "x"), "verify", /^Couldn't sign you in\. Try again\.$/],
    [tk("UNKNOWN", "x"), "passkey-login", /^Couldn't sign in with that passkey/],
    [tk("UNKNOWN", "x"), "passkey-signup", /^Couldn't create a passkey/],
  ];
  for (const [e, during, want] of cases) {
    const { text } = signInError(e, during);
    assert.match(text, want, text);
    assert.ok(!/Turnkey|OTP|—|error \d/i.test(text), `no internals or em dashes: ${text}`);
  }
});

console.log(`selftest-signin-sheet: ${passed} passed`);
