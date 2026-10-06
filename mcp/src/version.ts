import { readFileSync } from "node:fs";

/** This package's version, read from package.json (next to src/ and dist/ alike). */
export function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
