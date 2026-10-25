/**
 * Self-test: the admin code (lib/adminAuth). There is no built-in code: a
 * build without ADMIN_ACCESS_CODE has no admin sign-in, in development too,
 * so a reachable dev server cannot be opened (or a session forged) with a
 * code that is public in the repo.
 *
 * Run from app/:  ../mcp/node_modules/.bin/tsx scripts/selftest-admin-auth.mts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";

const stub = fileURLToPath(new URL("./server-only-stub.cjs", import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === "server-only" ? stub : resolve.call(this, req, ...rest);
};

const auth = await import("../src/lib/adminAuth");
const env = process.env as Record<string, string | undefined>;
let n = 0;

for (const mode of ["development", "test", "production"]) {
  env.NODE_ENV = mode;
  delete env.ADMIN_ACCESS_CODE;
  assert.equal(auth.adminCodeConfigured(), false, `${mode}: no code, no admin sign-in`);
  assert.equal(auth.verifyAdminCode("gloam-dev-admin"), false, `${mode}: the old built-in code is refused`);
  assert.equal(auth.createAdminSession(), null, `${mode}: no session without a code`);
  const exp = String(Math.floor(Date.now() / 1000) + 3600);
  const forged = `${exp}.${createHmac("sha256", "gloam-dev-admin").update(exp).digest("base64url")}`;
  assert.equal(auth.verifyAdminSession(forged), false, `${mode}: a session signed with the old built-in code is refused`);
  n += 4;
}

env.ADMIN_ACCESS_CODE = "a-long-random-admin-code-for-this-test";
assert.equal(auth.verifyAdminCode("a-long-random-admin-code-for-this-test"), true);
const session = auth.createAdminSession();
assert.ok(session && auth.verifyAdminSession(session));
assert.equal(auth.verifyAdminCode("gloam-dev-admin"), false);
n += 3;

console.log(`admin auth: ${n} passed`);
