// The agent plugin and the MCP Registry entries name this server by exact version
// (integrations/). A release that leaves one behind keeps installing the old server,
// so every pin has to be the version in package.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(repo, path), "utf8");
const current: string = JSON.parse(read("mcp/package.json")).version;

const PLUGIN = "integrations/plugins/plugins/gloam";
const MANIFESTS = [`${PLUGIN}/plugin.json`, `${PLUGIN}/.claude-plugin/plugin.json`, `${PLUGIN}/.codex-plugin/plugin.json`, `${PLUGIN}/.cursor-plugin/plugin.json`];
const REGISTRY = ["integrations/registry/server.json", "integrations/plugins/registry/gloam/server.json"];

test("the plugin's MCP configs run the current server", () => {
  for (const file of [`${PLUGIN}/.mcp.json`, `${PLUGIN}/mcp.json`]) {
    const args: string[] = JSON.parse(read(file)).mcpServers.gloam.args;
    assert.ok(args.includes(`@gloamtrade/mcp@${current}`), `${file} runs ${args.join(" ")}`);
  }
});

test("the plugin manifests carry the server's version", () => {
  for (const file of MANIFESTS) assert.equal(JSON.parse(read(file)).version, current, file);
});

test("the registry entries name the current server package", () => {
  for (const file of REGISTRY) {
    const pkg = (JSON.parse(read(file)).packages as { identifier: string; version: string }[]).find((p) => p.identifier === "@gloamtrade/mcp");
    assert.equal(pkg?.version, current, file);
  }
});

test("the two registry entries are the same file", () => {
  assert.equal(read(REGISTRY[0]!), read(REGISTRY[1]!));
});

test("every @gloamtrade/mcp@x.y.z in the plugin's docs and skills is the current one", () => {
  const files = (readdirSync(join(repo, "integrations"), { recursive: true }) as string[]).filter(
    (f) => /\.(json|md)$/.test(f) && !f.split("/").includes("node_modules")
  );
  let seen = 0;
  for (const f of files) {
    const path = join("integrations", f);
    for (const [, v] of read(path).matchAll(/@gloamtrade\/mcp@(\d+\.\d+\.\d+)/g)) {
      seen++;
      assert.equal(v, current, `${path} names @gloamtrade/mcp@${v}`);
    }
  }
  assert.ok(seen > 0, "no pin found: the check is looking in the wrong place");
});
