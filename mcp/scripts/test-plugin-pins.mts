/**
 * The agent plugin and the MCP Registry entries pin this server exactly
 * (integrations/). Every pin must be the version in package.json, so a
 * release cannot leave the plugin or the registry installing an older server.
 *
 *   pnpm --filter @gloamtrade/mcp test
 *
 * Reads files only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const VERSION: string = JSON.parse(read("mcp/package.json")).version;

const PLUGIN = "integrations/plugins/plugins/gloam";
const REGISTRY = ["integrations/registry/server.json", "integrations/plugins/registry/gloam/server.json"];

test("the plugin runs the current server", () => {
  for (const file of [`${PLUGIN}/.mcp.json`, `${PLUGIN}/mcp.json`]) {
    const args: string[] = JSON.parse(read(file)).mcpServers.gloam.args;
    assert.ok(args.includes(`@gloamtrade/mcp@${VERSION}`), `${file} runs ${args.join(" ")}, not @gloamtrade/mcp@${VERSION}`);
  }
});

test("the registry entries name the current server", () => {
  for (const file of REGISTRY) {
    const pkg = (JSON.parse(read(file)).packages as { identifier: string; version: string }[]).find((p) => p.identifier === "@gloamtrade/mcp");
    assert.equal(pkg?.version, VERSION, file);
  }
});

test("every @gloamtrade/mcp@<version> in the plugins' files and docs is the current one", () => {
  const files = (readdirSync(join(ROOT, "integrations"), { recursive: true }) as string[])
    .filter((f) => /\.(json|md)$/.test(f))
    .map((f) => join(ROOT, "integrations", f));
  let found = 0;
  for (const file of files) {
    for (const [, v] of readFileSync(file, "utf8").matchAll(/@gloamtrade\/mcp@(\d+\.\d+\.\d+)/g)) {
      found++;
      assert.equal(v, VERSION, `${file.slice(ROOT.length + 1)} names @gloamtrade/mcp@${v}`);
    }
  }
  assert.ok(found > 0, "the plugin pins a version");
});
