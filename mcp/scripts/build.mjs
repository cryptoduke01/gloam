#!/usr/bin/env node
/**
 * Builds the publishable server: one ESM file at dist/index.js.
 *
 * The Gloam workspace packages (@gloamtrade/sdk and friends) ship TypeScript
 * source, which plain Node will not run from node_modules. So they are bundled
 * in, and everything else stays an ordinary npm dependency, resolved at run
 * time. A bare import that is neither a workspace package nor listed in this
 * package's dependencies fails the build, so the published package can never
 * reach for a module its users do not have.
 */
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const isWorkspace = (spec) => typeof spec === "string" && spec.startsWith("workspace:");
const allDeps = { ...pkg.devDependencies, ...pkg.dependencies };
/** Workspace packages: bundled. */
const bundled = Object.keys(allDeps).filter((name) => isWorkspace(allDeps[name]));
/** Runtime dependencies: left as imports. */
const runtime = Object.keys(pkg.dependencies ?? {}).filter((name) => !isWorkspace(pkg.dependencies[name]));

const misplaced = Object.keys(pkg.dependencies ?? {}).filter((name) => isWorkspace(pkg.dependencies[name]));
if (misplaced.length) {
  console.error(
    `build: ${misplaced.join(", ")} ${misplaced.length === 1 ? "is a workspace package" : "are workspace packages"} in "dependencies". ` +
      `They are bundled into dist, so list them under "devDependencies"; otherwise npm would try to install them for every user.`
  );
  process.exit(1);
}

const packageName = (spec) => {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const undeclared = new Set();
const dependencyGuard = {
  name: "gloam-dependency-guard",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (builtins.has(args.path) || args.path.startsWith("node:")) return { path: args.path, external: true };
      const name = packageName(args.path);
      if (bundled.includes(name)) return undefined; // bundle it
      if (runtime.includes(name)) return { path: args.path, external: true };
      undeclared.add(`${name} (imported from ${args.importer.replace(root, "mcp")})`);
      return { path: args.path, external: true };
    });
  },
};

rmSync(join(root, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(root, "dist/index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
  plugins: [dependencyGuard],
});

if (undeclared.size) {
  console.error(
    `build: these imports are not dependencies of ${pkg.name}, so the published server would crash on them:\n  ` +
      [...undeclared].join("\n  ") +
      `\nAdd them to "dependencies" in mcp/package.json.`
  );
  rmSync(join(root, "dist"), { recursive: true, force: true });
  process.exit(1);
}

console.error(`build: dist/index.js (${pkg.name}@${pkg.version}; bundled ${bundled.join(", ") || "nothing"})`);
