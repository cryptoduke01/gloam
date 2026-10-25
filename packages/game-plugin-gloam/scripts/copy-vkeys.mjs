// tsc does not copy JSON it does not import: put the checking keys next to the built code.
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
cpSync(join(root, "src", "vkeys"), join(root, "dist", "vkeys"), { recursive: true });
