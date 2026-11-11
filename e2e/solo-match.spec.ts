import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { ROUNDS_PER_MATCH } from "../src/shared/rooms";

// Spec #3, seam 4: a Solo Match played start to finish in a real browser,
// typing the answers the local Catalogue gives: the picture URL's key is
// enough to know the Word, as a Player recognising the picture would. With
// too few Words for a Match, the test Catalogue goes in first (through the
// dev server; needs CLI_API_KEY in .env.local). Its pictures aren't in local
// R2, so they don't show.

/** Spelling per picture key, read from the local D1. */
function localCatalogue(): Map<string, string> {
	const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", "select picture_key, spelling from words"], { encoding: "utf8" });
	const [{ results }] = JSON.parse(out) as [{ results: { picture_key: string; spelling: string }[] }];
	return new Map(results.map((r) => [r.picture_key, r.spelling]));
}

let words = new Map<string, string>();

test.beforeAll(() => {
	words = localCatalogue();
	if (words.size >= ROUNDS_PER_MATCH) return;
	execFileSync("npm", ["run", "db:seed", "--", "--env", "local", "--file", "test-catalogue"], { stdio: "inherit" });
	words = localCatalogue();
});

const wordFor = (pictureUrl: string) => {
	const word = words.get(pictureUrl.split("/").at(-1)!);
	if (!word) throw new Error(`no local Word for ${pictureUrl}`);
	return word;
};

test("create a Solo Room, play 5 Rounds, see the Podium", async ({ page }) => {
	// A Round runs its full 15 s even once solved: 5 × (3 s countdown + 15 s + 5 s reveal).
	test.setTimeout(180_000);
	await page.goto("/");
	await page.getByRole("button", { name: "Create Solo Room" }).click();
	await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
	await page.getByRole("button", { name: "Start" }).click();

	for (let round = 1; round <= ROUNDS_PER_MATCH; round++) {
		await expect(page.getByText(`Round ${round} of ${ROUNDS_PER_MATCH}`)).toBeVisible({ timeout: 30_000 });
		const src = await page.getByRole("img", { name: "What is this?" }).getAttribute("src");
		// Type only the typed slots: Hint Letters are given, and the cursor skips them.
		const kinds = await page.locator("[data-slot-kind]").evaluateAll((slots) => slots.map((s) => s.getAttribute("data-slot-kind")));
		await page.keyboard.type([...wordFor(src!)].filter((_, i) => kinds[i] === "typed").join(""));
		await expect(page.getByText(/^Correct! \+\d+$/)).toBeVisible();
	}

	const podium = page.getByRole("list", { name: "Podium" });
	await expect(podium).toBeVisible({ timeout: 30_000 });
	await expect(podium.getByRole("listitem")).toHaveCount(1);
	await expect(podium.getByLabel("Place 1")).toBeVisible();
	await expect(page.getByRole("heading", { name: /^You scored \d+ points$/ })).toBeVisible();
	await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
});
