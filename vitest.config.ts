import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

const alias = { "@": path.resolve(import.meta.dirname, "./src/react-app") };

// Worker tests are hermetic: wrangler would otherwise load the developer's .env.local into them (an empty
// BETTER_AUTH_SECRET, Google credentials, DEMO_MODE, a dev-server port...), so a suite that passes on one
// machine fails on another. Every variable and secret the Worker reads in a test is pinned here instead;
// a new secret gets a fixed test value in TEST_BINDINGS.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
const TEST_BINDINGS = {
	ENVIRONMENT: "test",
	APP_BASE_URL: "http://localhost:5173",
	BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef",
	CLI_API_KEY: "test-cli-key",
	GUEST_TOKEN_SECRET: "test-guest-token-secret",
};

// Three projects:
//  - worker:   runs inside workerd with the real wrangler.toml bindings (D1, Durable Objects)
//  - cross-db: runs in Node against PostgreSQL (PGlite always; real servers when TEST_*_URL is set)
//              and MySQL, using the same behavioural suite as the D1 run.
//  - scripts:  runs in Node, for the release tooling in bin/lib.
// Kept separate from vite.config.ts so tests don't load the dev/build plugin.
export default defineConfig({
	test: {
		// Better Auth 1.7 leaves the APIError of a refused sign-in (401: wrong password, or a correct one whose session
		// the hook refused) and of an OAuth callback redirect (302) as a rejected promise that the Workers pool reports
		// as unhandled, although the HTTP response is correct (the dev server logs the same thing as
		// `[worker] unhandled promise rejection [APIError…]` for any refused sign-in: upstream behaviour). Ignore only those errors.
		onUnhandledError: (error) => {
			const e = error as { body?: { code?: string }; status?: string; statusCode?: number };
			return e.body?.code === "INVALID_EMAIL_OR_PASSWORD" || e.body?.code === "FAILED_TO_CREATE_SESSION" || (e.status === "FOUND" && e.statusCode === 302) ? false : undefined;
		},
		projects: [
			{
				plugins: [
					cloudflareTest({
						wrangler: { configPath: "./wrangler.toml" },
						// wrangler.toml marks EMAIL as remote=true for local dev; tests must stay offline.
						remoteBindings: false,
						miniflare: {
							// Extra empty D1 databases for isolated migration tests.
							d1Databases: ["DB2", "DB3"],
							bindings: TEST_BINDINGS,
						},
					}),
				],
				resolve: { alias },
				test: {
					name: "worker",
					include: ["test/**/*.test.ts"],
					exclude: ["test/cross-db/**", "test/scripts/**"],
					setupFiles: ["./test/apply-migrations.ts"],
				},
			},
			{
				resolve: { alias },
				test: {
					name: "cross-db",
					include: ["test/cross-db/**/*.test.ts"],
					environment: "node",
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				test: {
					name: "scripts",
					include: ["test/scripts/**/*.test.ts"],
					environment: "node",
				},
			},
		],
	},
});
