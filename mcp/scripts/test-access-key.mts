/**
 * Tempo access keys (onchain agent limits), the settings file and the CLI.
 * No chain needed: reads are mocked and transactions are signed offline.
 *
 *   pnpm --filter @gloamtrade/mcp test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFunctionData, isAddressEqual, keccak256, numberToHex, recoverAddress, toFunctionSelector, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Transaction } from "viem/tempo";
import {
  ACCOUNT_KEYCHAIN_ABI,
  authorizeKeyCalldata,
  buildAccessKeyPlan,
  checkAccessKey,
  keyRestrictions,
  parseDuration,
  parseExpiry,
  parseLimits,
  parsePeriod,
  tempoTokens,
  type AccessKeyPolicy,
} from "../src/accessKey.js";
import { runAuthorizeAccessKey } from "../src/cli.js";
import { appendEnvFile, loadEnvFile, parseEnvFile } from "../src/envFile.js";
import { MCP_NETWORKS } from "../src/networks.js";
import { getSigner, signerSetup } from "../src/signer.js";

const tempo = MCP_NETWORKS.tempo;
const POOL = tempo.pool;
const PATHUSD = tempoTokens().find((t) => t.symbol === "PathUSD")!;
const NOW = 1_790_000_000;

function policy(over: Partial<AccessKeyPolicy> = {}): AccessKeyPolicy {
  return {
    network: tempo,
    owner: "0x1111111111111111111111111111111111111111",
    keyId: "0x2222222222222222222222222222222222222222",
    limits: parseLimits(["25"]),
    period: 86400,
    expiry: NOW + 30 * 86400,
    ...over,
  };
}

// ------------------------------------------------------------------ the authorization

test("authorizeKey uses the canonical T3 selector and round-trips", () => {
  const data = authorizeKeyCalldata(policy());
  assert.equal(data.slice(0, 10), "0x980a6025");
  const decoded = decodeFunctionData({ abi: ACCOUNT_KEYCHAIN_ABI, data });
  assert.equal(decoded.functionName, "authorizeKey");
  const [keyId, sigType, config] = decoded.args as [Address, number, ReturnType<typeof keyRestrictions>];
  assert.equal(keyId, "0x2222222222222222222222222222222222222222");
  assert.equal(sigType, 0);
  assert.equal(config.expiry, BigInt(NOW + 30 * 86400));
  assert.equal(config.enforceLimits, true);
  assert.equal(config.allowAnyCalls, false);
  assert.deepEqual(config.limits, [{ token: PATHUSD.address, amount: 25_000_000n, period: 86400n }]);
});

test("the key may only approve the pool and call shieldBound/transfer on it", () => {
  const r = keyRestrictions(policy({ limits: parseLimits(["PathUSD=5", "AlphaUSD=7"]) }));
  assert.equal(r.allowAnyCalls, false);
  assert.equal(r.enforceLimits, true);
  const approve = toFunctionSelector("approve(address,uint256)");
  for (const symbol of ["PathUSD", "AlphaUSD"]) {
    const token = tempoTokens().find((t) => t.symbol === symbol)!.address;
    const scope = r.allowedCalls.find((c) => isAddressEqual(c.target, token))!;
    assert.deepEqual(scope.selectorRules, [{ selector: approve, recipients: [POOL] }], `${symbol}: approve, spender = pool only`);
  }
  const pool = r.allowedCalls.find((c) => isAddressEqual(c.target, POOL))!;
  assert.deepEqual(
    pool.selectorRules.map((s) => s.selector).sort(),
    [toFunctionSelector("shieldBound(address,uint256,bytes32,bytes)"), toFunctionSelector("transfer(bytes,bytes32,bytes32,bytes32[2])")].sort()
  );
  assert.ok(pool.selectorRules.every((s) => s.recipients.length === 0));
  assert.equal(r.allowedCalls.length, 3, "two tokens and the pool, nothing else");
  assert.deepEqual(r.limits.map((l) => l.amount), [5_000_000n, 7_000_000n]);
});

test("one-time limits carry period 0; the wallet request omits period", () => {
  const plan = buildAccessKeyPlan(policy({ period: 0 }));
  assert.equal(plan.restrictions.limits[0].period, 0n);
  const req = plan.walletRequest.params[0] as { limits: Record<string, unknown>[]; chainId: string };
  assert.equal("period" in req.limits[0], false);
  assert.equal(req.chainId, "0xa5bf");
  assert.match(plan.period.text, /one-time/);
});

test("the cast command encodes the same calldata as the raw transaction", { skip: !castBinary() && "Foundry cast not installed" }, () => {
  const plan = buildAccessKeyPlan(policy());
  const args = plan.castCommand
    .split(" \\\n")
    .slice(1, 3)
    .map((s) => s.trim());
  const sig = args[0].replace(/^'|'$/g, "");
  const [keyId, sigType] = args[1].split(" ");
  const tuple = plan.castCommand.split(" \\\n")[3].trim().replace(/^'|'$/g, "");
  const out = spawnSync(castBinary()!, ["calldata", sig, keyId, sigType, tuple], { encoding: "utf8", env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" } });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), plan.transaction.data);
});

test("parsing durations, periods, expiries and limits", () => {
  assert.equal(parseDuration("90m"), 5400);
  assert.equal(parseDuration("7d"), 604800);
  assert.equal(parsePeriod("once"), 0);
  assert.equal(parsePeriod("1w"), 604800);
  assert.throws(() => parseDuration("0d"));
  assert.throws(() => parseDuration("soon"));
  assert.equal(parseExpiry("1d", NOW), NOW + 86400);
  assert.equal(parseExpiry("2026-12-31", NOW), Date.parse("2026-12-31T23:59:59Z") / 1000);
  assert.throws(() => parseExpiry("2020-01-01", NOW), /not in the future/);
  assert.deepEqual(parseLimits(["2.5"]).map((l) => [l.token.symbol, l.amount]), [["PathUSD", 2_500_000n]]);
  assert.throws(() => parseLimits(["DOGE=5"]), /Unknown Tempo asset/);
  assert.throws(() => parseLimits(["5", "PathUSD=6"]), /twice/);
  assert.throws(() => parseLimits(["0"]), /more than 0/);
  assert.throws(() => parseLimits([]), /at least one/);
});

// ------------------------------------------------------------------ the signer

test("without GLOAM_TEMPO_ACCOUNT the key signs as itself on both networks", () => {
  const key = generatePrivateKey();
  const addr = privateKeyToAccount(key).address;
  for (const net of [MCP_NETWORKS.robinhood, tempo]) {
    const s = getSigner(net, { GLOAM_AGENT_PRIVATE_KEY: key })!;
    assert.equal(s.mode, "key");
    assert.equal(s.account.address, addr);
    assert.equal(s.keyAddress, addr);
  }
  assert.equal(getSigner(tempo, {}), null);
});

test("with GLOAM_TEMPO_ACCOUNT the key acts for the owner on Tempo only", () => {
  const key = generatePrivateKey();
  const keyAddr = privateKeyToAccount(key).address;
  const owner = privateKeyToAccount(generatePrivateKey()).address;
  const env = { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_TEMPO_ACCOUNT: owner.toLowerCase() };
  const t = getSigner(tempo, env)!;
  assert.equal(t.mode, "access-key");
  assert.equal(t.account.address, owner, "transactions come from the owner's account");
  assert.equal(t.keyAddress, keyAddr);
  assert.equal(t.walletClient.chain.id, tempo.chainId);
  const rh = getSigner(MCP_NETWORKS.robinhood, env)!;
  assert.equal(rh.mode, "key", "Robinhood Chain has no keychain");
  assert.equal(rh.account.address, keyAddr);
  assert.deepEqual(signerSetup(env), { mode: "access-key", keyAddress: keyAddr, owner });
});

test("a malformed key or account fails closed, without echoing the key", () => {
  const key = generatePrivateKey();
  assert.throws(() => getSigner(tempo, { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_TEMPO_ACCOUNT: "0x1234" }), /GLOAM_TEMPO_ACCOUNT is not an address/);
  assert.throws(
    () => getSigner(tempo, { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_TEMPO_ACCOUNT: privateKeyToAccount(key).address }),
    /own address/
  );
  const bad = `${key.slice(0, 60)}zz`;
  assert.throws(
    () => getSigner(tempo, { GLOAM_AGENT_PRIVATE_KEY: bad }),
    (e: Error) => /not a 32-byte hex private key/.test(e.message) && !e.message.includes(bad.slice(2))
  );
});

test("the access key signs Tempo transactions for the owner with a keychain signature", async () => {
  const key = generatePrivateKey();
  const keyAddr = privateKeyToAccount(key).address;
  const owner = privateKeyToAccount(generatePrivateKey()).address;
  const s = getSigner(tempo, { GLOAM_AGENT_PRIVATE_KEY: key, GLOAM_TEMPO_ACCOUNT: owner })!;
  const signTransaction = s.account.signTransaction!;
  const serialized = (await signTransaction({
    type: "tempo",
    chainId: tempo.chainId,
    nonce: 0,
    gas: 300_000n,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 0n,
    calls: [{ to: POOL, data: toFunctionSelector("transfer(bytes,bytes32,bytes32,bytes32[2])"), value: 0n }],
  } as never)) as Hex;
  assert.ok(serialized.startsWith("0x76"), "a Tempo transaction");
  const tx = Transaction.deserialize(serialized as `0x76${string}`) as unknown as {
    signature: { type: string; userAddress: Address; inner: unknown; version?: string };
  };
  assert.equal(tx.signature.type, "keychain");
  assert.ok(isAddressEqual(tx.signature.userAddress, owner), "the keychain envelope names the owner");
  // The inner signature is the access key's, over keccak256(0x04 || txHash || owner) (keychain v2).
  const unsigned = await Transaction.serialize({ ...(Transaction.deserialize(serialized as `0x76${string}`) as object), signature: undefined } as never);
  const inner = keccak256(`0x04${keccak256(unsigned as Hex).slice(2)}${owner.slice(2).toLowerCase()}` as Hex);
  const sig = (tx.signature.inner as { signature: { r: bigint; s: bigint; yParity: number } }).signature;
  const signer = await recoverAddress({ hash: inner, signature: { r: numberToHex(sig.r, { size: 32 }), s: numberToHex(sig.s, { size: 32 }), yParity: sig.yParity } });
  assert.equal(signer, keyAddr, "signed by the access key, bound to the owner");
});

// ------------------------------------------------------------------ settings file

test("settings file: GLOAM_* only, the environment wins, appends never replace", () => {
  const { values, ignored } = parseEnvFile(
    ["# comment", "export GLOAM_A=1", "GLOAM_B = 'two words'", 'GLOAM_C="x" ', "GLOAM_D=y # note", "NODE_OPTIONS=--evil", "PATH=/tmp"].join("\n")
  );
  assert.deepEqual(values, { GLOAM_A: "1", GLOAM_B: "two words", GLOAM_C: "x", GLOAM_D: "y" });
  assert.deepEqual(ignored, ["NODE_OPTIONS", "PATH"]);

  const dir = mkdtempSync(join(tmpdir(), "gloam-env-"));
  const path = join(dir, "sub", "agent.env");
  appendEnvFile(path, [{ key: "GLOAM_X", value: "1" }]);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const again = appendEnvFile(path, [{ key: "GLOAM_X", value: "2" }, { key: "GLOAM_Y", value: "3" }]);
  assert.deepEqual(again, { written: ["GLOAM_Y"], kept: ["GLOAM_X"] });
  assert.throws(() => appendEnvFile(path, [{ key: "PATH", value: "x" }]));

  const env: Record<string, string | undefined> = { GLOAM_ENV_FILE: path, GLOAM_X: "from-env" };
  const r = loadEnvFile(env);
  assert.equal(env.GLOAM_X, "from-env");
  assert.equal(env.GLOAM_Y, "3");
  assert.deepEqual(r.loaded, ["GLOAM_Y"]);
  assert.deepEqual(r.warnings, []);

  writeFileSync(path, "GLOAM_Z=1\n");
  chmodSync(path, 0o644);
  assert.match(loadEnvFile({ GLOAM_ENV_FILE: path }).warnings.join(), /chmod 600/);
  assert.match(loadEnvFile({ GLOAM_ENV_FILE: join(dir, "missing.env") }).warnings.join(), /does not exist/);
});

// ------------------------------------------------------------------ CLI

test("authorize-access-key --generate saves the key (never prints it) and prints the plan", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gloam-cli-"));
  const path = join(dir, "agent.env");
  const owner = privateKeyToAccount(generatePrivateKey()).address;
  const lines: string[] = [];
  const env: Record<string, string | undefined> = { GLOAM_ENV_FILE: path };
  const code = await runAuthorizeAccessKey(["--owner", owner, "--generate", "--limit", "25", "--period", "1d", "--expires", "30d"], env, (s) => lines.push(s), NOW);
  assert.equal(code, 0);
  const saved = parseEnvFile(readFileSync(path, "utf8")).values;
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.match(saved.GLOAM_AGENT_PRIVATE_KEY, /^0x[0-9a-f]{64}$/);
  assert.equal(saved.GLOAM_TEMPO_ACCOUNT, owner);
  assert.match(saved.GLOAM_NOTE_KEY, /^[0-9a-f]{64}$/);
  assert.equal(saved.GLOAM_LIMIT_ASSETS, "PathUSD");
  assert.equal(saved.GLOAM_LIMIT_MAX_PER_DAY, "25");
  const output = lines.join("\n");
  assert.ok(!output.includes(saved.GLOAM_AGENT_PRIVATE_KEY.slice(2)), "the key is never printed");
  assert.ok(!output.includes(saved.GLOAM_NOTE_KEY), "the note key is never printed");
  const keyAddr = privateKeyToAccount(saved.GLOAM_AGENT_PRIVATE_KEY as Hex).address;
  assert.ok(output.includes(keyAddr));
  assert.ok(output.includes("0x980a6025"));
  assert.ok(output.includes("25 PathUSD every day"));

  // A second --generate against a configured key is refused; without it, the configured key is used.
  const env2: Record<string, string | undefined> = { GLOAM_ENV_FILE: path };
  loadEnvFile(env2);
  await assert.rejects(runAuthorizeAccessKey(["--owner", owner, "--generate"], env2, () => {}, NOW), /already configured/);
  const json: string[] = [];
  assert.equal(await runAuthorizeAccessKey(["--json"], env2, (s) => json.push(s), NOW), 0);
  const plan = JSON.parse(json.join(""));
  assert.equal(plan.accessKey, keyAddr);
  assert.equal(plan.owner, owner);
  assert.equal(plan.expiry.unix, NOW + 30 * 86400);
});

test("authorize-access-key refuses bad input", async () => {
  const run = (args: string[]) => runAuthorizeAccessKey(args, {}, () => {}, NOW);
  await assert.rejects(run(["--key", "0x2222222222222222222222222222222222222222"]), /--owner/);
  await assert.rejects(run(["--owner", "0x1111111111111111111111111111111111111111"]), /No agent key/);
  await assert.rejects(run(["--owner", "0x1111111111111111111111111111111111111111", "--key", "0x1111111111111111111111111111111111111111"]), /cannot be the owner/);
  await assert.rejects(run(["--owner", "nope", "--key", "0x2222222222222222222222222222222222222222"]), /not an address/);
  await assert.rejects(run(["--frobnicate"]), /Unknown option/);
  assert.equal(existsSync(join(homedir(), ".gloam", "agent.env.test-should-not-exist")), false);
});

// ------------------------------------------------------------------ status

function mockReads(state: {
  key?: { keyId: Address; expiry: bigint; enforceLimits: boolean; isRevoked: boolean };
  scoped?: boolean;
  scopes?: { target: Address; selectorRules: { selector: Hex; recipients: Address[] }[] }[];
  remaining?: Record<string, [bigint, bigint]>;
  allowance?: Record<string, bigint>;
}) {
  return {
    readContract: async ({ address, functionName, args }: { address: Address; functionName: string; args: Address[] }) => {
      switch (functionName) {
        case "getKey":
          return { signatureType: 0, keyId: "0x0000000000000000000000000000000000000000", expiry: 0n, enforceLimits: false, isRevoked: false, ...state.key };
        case "getAllowedCalls":
          return [state.scoped ?? true, state.scopes ?? []];
        case "getRemainingLimitWithPeriod":
          return state.remaining?.[args[2].toLowerCase()] ?? [0n, 0n];
        case "allowance":
          return state.allowance?.[address.toLowerCase()] ?? 0n;
      }
      throw new Error(functionName);
    },
  } as never;
}

test("check: a good key is ready; a standing pool allowance, no scopes or no limit is flagged", async () => {
  const owner = "0x1111111111111111111111111111111111111111" as Address;
  const keyId = "0x2222222222222222222222222222222222222222" as Address;
  const r = keyRestrictions(policy());
  const good = {
    key: { keyId, expiry: BigInt(NOW + 1000), enforceLimits: true, isRevoked: false },
    scopes: r.allowedCalls,
    remaining: { [PATHUSD.address.toLowerCase()]: [25_000_000n, BigInt(NOW + 500)] as [bigint, bigint] },
  };
  const ok = await checkAccessKey({ owner, keyId, nowSec: NOW }, mockReads(good));
  assert.equal(ok.ok, true, ok.warnings.join("; "));
  assert.deepEqual(ok.limits.map((l) => [l.symbol, l.remaining]), [["PathUSD", "25"]]);

  const allowance = await checkAccessKey(
    { owner, keyId, nowSec: NOW },
    mockReads({ ...good, allowance: { [PATHUSD.address.toLowerCase()]: (1n << 256n) - 1n } })
  );
  assert.equal(allowance.ok, false);
  assert.match(allowance.warnings.join(), /unlimited amount of PathUSD.*approve\(address,uint256\)/);

  const open = await checkAccessKey({ owner, keyId, nowSec: NOW }, mockReads({ ...good, scoped: false, scopes: [] }));
  assert.match(open.warnings.join(), /may call any contract/);

  const unlimited = await checkAccessKey({ owner, keyId, nowSec: NOW }, mockReads({ ...good, key: { ...good.key, enforceLimits: false } }));
  assert.match(unlimited.warnings.join(), /NO spending limit/);

  const expired = await checkAccessKey({ owner, keyId, nowSec: NOW }, mockReads({ ...good, key: { ...good.key, expiry: BigInt(NOW - 1) } }));
  assert.equal(expired.expired, true);
  assert.match(expired.warnings.join(), /expired/);

  const missing = await checkAccessKey({ owner, keyId, nowSec: NOW }, mockReads({}));
  assert.equal(missing.authorized, false);
  assert.match(missing.warnings.join(), /not authorized/);
});

function castBinary(): string | null {
  for (const p of [join(homedir(), ".foundry", "bin", "cast"), "/usr/local/bin/cast", "/opt/homebrew/bin/cast"]) if (existsSync(p)) return p;
  const which = spawnSync("which", ["cast"], { encoding: "utf8" });
  return which.status === 0 ? which.stdout.trim() : null;
}
