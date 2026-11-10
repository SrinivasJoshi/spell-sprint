// The Blacksmith theme (issue #18): every colour of the design file is a theme variable, with the same value,
// and the React app names no colour of its own outside the theme files.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** The `colors:` block of the design file's front matter, as name → hex. */
function designColours(): Record<string, string> {
	const frontMatter = read("blacksmith.sh-design.md").split("---")[1];
	const block = frontMatter.split(/^colors:\n/m)[1].split(/^\S/m)[0];
	return Object.fromEntries([...block.matchAll(/^\s+([\w-]+):\s*"(#[0-9A-Fa-f]{6})"/gm)].map(([, name, hex]) => [name, hex.toUpperCase()]));
}

/** An `H S% L%` triplet as an upper-case hex colour. */
function hslToHex(triplet: string): string {
	const [h, s, l] = triplet.replace(/%/g, "").trim().split(/\s+/).map(Number);
	const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(c * 255).toString(16).padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** The light theme's `:root` block of index.css. */
function lightRoot(): string {
	const css = read("src/react-app/index.css");
	return css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
}

function filesUnder(dir: string): string[] {
	return readdirSync(path.join(root, dir)).flatMap((name) => {
		const rel = path.join(dir, name);
		return statSync(path.join(root, rel)).isDirectory() ? filesUnder(rel) : [rel];
	});
}

describe("Blacksmith theme", () => {
	it("reads the design file's colours", () => {
		expect(Object.keys(designColours())).toEqual(expect.arrayContaining(["primary", "secondary", "info", "error"]));
	});

	it("has a --brand-<name> theme variable with the same value for every design colour", () => {
		const css = lightRoot();
		// A variable's value, following `var(--other)` aliases.
		const value = (variable: string): string | undefined => {
			const raw = css.match(new RegExp(`${variable}:\\s*([^;]+);`))?.[1].replace(/\/\*.*?\*\//g, "").trim();
			const alias = raw?.match(/^var\((--[\w-]+)\)$/);
			return alias ? value(alias[1]) : raw;
		};
		for (const [name, hex] of Object.entries(designColours())) {
			const triplet = value(`--brand-${name}`);
			expect(triplet, `--brand-${name} in index.css`).toBeDefined();
			expect(hslToHex(triplet!), `--brand-${name}`).toBe(hex);
		}
	});

	it("exposes every brand colour as a Tailwind colour", () => {
		const css = read("src/react-app/index.css");
		for (const name of Object.keys(designColours())) {
			expect(css).toContain(`--color-brand-${name}: hsl(var(--brand-${name}));`);
		}
	});

	it("names no raw hex colour in the React app outside the theme files", () => {
		// Theme files, and third-party marks whose colours are not ours to change.
		const allowed = new Set([
			"src/react-app/index.css",
			"src/react-app/admin/admin.css",
			"src/react-app/components/auth/GoogleSignInButton.tsx",
		]);
		const offenders = filesUnder("src/react-app")
			.filter((file) => /\.(tsx?|css)$/.test(file) && !allowed.has(file))
			.filter((file) => /#[0-9A-Fa-f]{3,8}\b/.test(read(file).replace(/&#x?[0-9A-Fa-f]+;/g, "")));
		expect(offenders, "raw hex colours (use a theme token; a third-party mark goes in `allowed`)").toEqual([]);
	});
});
