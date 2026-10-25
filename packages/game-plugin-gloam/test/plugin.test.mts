import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { ExecutableGameFunctionStatus, GameWorker } from "@virtuals-protocol/game";
import GloamPlugin, { GloamAgent } from "../src/index.ts";
import { registerSecret } from "../src/redact.ts";

function envFor(dir: string) {
  return {
    GLOAM_NETWORK: "base",
    GLOAM_AGENT_PRIVATE_KEY: `0x${randomBytes(32).toString("hex")}`,
    GLOAM_NOTE_STORE: join(dir, "notes.json"),
    GLOAM_DATA_DIR: dir,
    GLOAM_RPC_URL: "http://127.0.0.1:1",
  };
}

const call = (fn: { execute: (a: Record<string, { value: string }>, l: (m: string) => void) => Promise<{ status: string; feedback: string }> }, args: Record<string, string>, logs: string[]) =>
  fn.execute(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, { value: v }])), (m) => logs.push(m));

test("the plugin follows the game-node pattern: a worker with seven Gloam functions", () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-game-plugin-"));
  const plugin = new GloamPlugin({ env: envFor(dir) });
  const worker = plugin.getWorker();
  assert.ok(worker instanceof GameWorker);
  assert.equal(worker.id, "gloam_worker");
  assert.deepEqual(
    worker.functions.map((f) => f.name),
    ["gloam_private_balance", "gloam_add_privately", "gloam_pay_privately", "gloam_receive", "gloam_cash_out", "gloam_prove_funds", "gloam_verify_proof"]
  );
  for (const f of worker.functions) {
    const json = f.toJSON() as { fn_name: string; fn_description: string; args: { name: string; description: string }[] };
    assert.equal(json.fn_name, f.name);
    assert.ok(json.fn_description.length > 40);
    assert.ok(json.args.every((a) => a.name && a.description));
    // No function takes a key, a secret or a note handle from the planner.
    assert.ok(!json.args.some((a) => /key|secret|private/i.test(a.name)), `${f.name} takes nothing secret`);
  }
  // A custom id and function list, as the game-node plugins allow.
  const custom = plugin.getWorker({ id: "treasury", functions: [plugin.getPrivateBalanceFunction] });
  assert.equal(custom.id, "treasury");
  assert.equal(custom.functions.length, 1);
});

test("no limits means no money moves, and the refusal says why", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-game-plugin-"));
  const plugin = new GloamPlugin({ env: envFor(dir) });
  const logs: string[] = [];
  const res = await call(plugin.payPrivatelyFunction, { to: "claim link", amount: "1" }, logs);
  assert.equal(res.status, ExecutableGameFunctionStatus.Failed);
  const body = JSON.parse(res.feedback);
  assert.equal(body.status, "refused");
  assert.equal(body.code, "limits_unset");
  // Bad input fails cleanly before any chain call.
  const bad = await call(plugin.cashOutFunction, { amount: "1", to: "not-an-address" }, logs);
  assert.equal(bad.status, ExecutableGameFunctionStatus.Failed);
  assert.match(JSON.parse(bad.feedback).message, /limits|0x address/);
});

test("feedback and logs never carry a secret, even if the engine returned one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-game-plugin-"));
  const secret = `0x${randomBytes(31).toString("hex")}`;
  registerSecret(secret);
  const leaky = {
    network: { key: "base", testnet: true, assets: [{ symbol: "USDC" }] },
    balance: async () => ({ status: "ok", oops: secret, link: "https://www.gloam.trade/claim?net=base#claim=gloam1=eyJ2IjoxLCJ0IjoiZ2xvYW0tcHJpdmF0ZS1ub3RlIn0" }),
    address: async () => "gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE",
    limitsReport: () => ({ enforced: false }),
    pay: async () => {
      throw new Error(`failed with ${secret}`);
    },
  } as unknown as GloamAgent;
  const plugin = new GloamPlugin({ agent: leaky, env: envFor(dir) });
  const logs: string[] = [];
  const ok = await call(plugin.getPrivateBalanceFunction, {}, logs);
  assert.equal(ok.status, ExecutableGameFunctionStatus.Done);
  assert.ok(!ok.feedback.includes(secret.slice(2)));
  assert.ok(!ok.feedback.includes("#claim="));
  const failed = await call(plugin.payPrivatelyFunction, { to: "gloamr1.MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE", amount: "1" }, logs);
  assert.ok(!failed.feedback.includes(secret.slice(2)));
  assert.ok(logs.every((l) => !l.includes(secret.slice(2))));
  const env = await plugin.environment();
  assert.equal(env.gloam_network, "base");
  assert.equal(env.gloam_network_kind, "testnet");
  assert.ok(!JSON.stringify(env).includes(secret.slice(2)));
});

test("the agent's key never shows in what the engine reports", () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-game-plugin-"));
  const env = envFor(dir);
  const agent = new GloamAgent({ env, limits: { recipients: "any", assets: { USDC: { maxPerPayment: 5, maxPerDay: 10 } } } });
  const report = JSON.stringify({ limits: agent.limitsReport(), notes: agent.notes(), wallet: agent.walletAddress });
  assert.ok(!report.includes(env.GLOAM_AGENT_PRIVATE_KEY.slice(2)));
  assert.match(report, /"enforced":true/);
  assert.match(report, /"maxPerPayment":"5"/);
});
