import { expect, test } from "@playwright/test";
import { ROUNDS_PER_MATCH } from "../src/shared/rooms";
import { localCatalogue } from "./support/catalogue";

// Spec #3, seam 4: a Solo Match played start to finish in a real browser,
// typing the answers the local Catalogue gives: the picture URL's key is
// enough to know the Word, as a Player recognising the picture would.

let words = new Map<string, string>();

test.beforeAll(() => {
	words = localCatalogue();
});

const wordFor = (pictureUrl: string) => {
	const word = words.get(pictureUrl.split("/").at(-1)!);
	if (!word) throw new Error(`no local Word for ${pictureUrl}`);
	return word;
};

test("create a Solo Room, play 5 Rounds, see the Podium", async ({ page }) => {
	// A solved Round ends at once; the budget covers 5 × (3 s countdown + up to 15 s + 5 s reveal).
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
		// Solved by its one Player, the Round ends at once: straight to the reveal.
		await expect(page.getByText(`Round ${round}: the word was`)).toBeVisible();
		await expect(page.getByText(/^\+\d+ points$/)).toBeVisible();
	}

	const podium = page.getByRole("list", { name: "Podium" });
	await expect(podium).toBeVisible({ timeout: 30_000 });
	await expect(podium.getByRole("listitem")).toHaveCount(1);
	await expect(podium.getByLabel("Place 1")).toBeVisible();
	await expect(page.getByRole("heading", { name: /^You scored \d+ points$/ })).toBeVisible();
	await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
});
