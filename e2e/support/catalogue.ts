import { execFileSync } from "node:child_process";
import { ROUNDS_PER_MATCH } from "../../src/shared/rooms";

// The local Catalogue, for e2e Matches. With too few Words for a Match, the
// test Catalogue goes in first (through the dev server; needs CLI_API_KEY in
// .env.local). Its pictures aren't in local R2, so they don't show.

/** Spelling per picture key, read from the local D1. */
export function localCatalogue(): Map<string, string> {
	const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", "select picture_key, spelling from words"], { encoding: "utf8" });
	const [{ results }] = JSON.parse(out) as [{ results: { picture_key: string; spelling: string }[] }];
	return new Map(results.map((r) => [r.picture_key, r.spelling]));
}

/**
 * Playwright's global setup: seeds the test Catalogue when the local one can't
 * fill a Match. Once per run, before any spec: two wrangler commands on the
 * local D1 at once fail.
 */
export default function ensureLocalCatalogue(): void {
	if (localCatalogue().size >= ROUNDS_PER_MATCH) return;
	execFileSync("npm", ["run", "db:seed", "--", "--env", "local", "--file", "test-catalogue"], { stdio: "inherit" });
}
