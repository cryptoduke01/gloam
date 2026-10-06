/**
 * Prints what a wallet owner signs to give the agent a Tempo access key with an
 * onchain spending limit, expiry and call scopes. Never signs or broadcasts.
 *
 *   pnpm --filter @gloamtrade/mcp authorize-access-key --owner 0xOWNER --generate --limit 25 --period 1d --expires 30d
 *   pnpm --filter @gloamtrade/mcp authorize-access-key --check --owner 0xOWNER --key 0xKEY
 *
 * The same command ships in the package: npx -y @gloamtrade/mcp authorize-access-key --help
 */
import { loadEnvFile } from "../src/envFile.js";
import { runAuthorizeAccessKey } from "../src/cli.js";

loadEnvFile(process.env);
try {
  process.exitCode = await runAuthorizeAccessKey(process.argv.slice(2), process.env);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
