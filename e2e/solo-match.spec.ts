import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { ROUNDS_PER_MATCH } from "../src/shared/rooms";
import { testWordFor } from "../src/worker/db/seeds/test-catalogue";

// Spec #3, seam 4: a Solo Match played start to finish in a real browser,
// typing the answers the test Catalogue gives. The Catalogue's rows go into
// the local D1 through the dev server (idempotent; needs CLI_API_KEY in
// .env.local). Its pictures aren't in local R2, so they don't show; the
// picture URL is enough to know the Word, as it is for the Worker tests.
// A local Catalogue holding other Words too would draw ones the test can't answer.
test.beforeAll(() => {
	execFileSync("npm", ["run", "db:seed", "--", "--env", "local", "--file", "test-catalogue"], { stdio: "inherit" });
});

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
		await page.keyboard.type(testWordFor(src!));
		await expect(page.getByText(/^Correct! \+\d+$/)).toBeVisible();
	}

	const podium = page.getByRole("list", { name: "Podium" });
	await expect(podium).toBeVisible({ timeout: 30_000 });
	await expect(podium.getByRole("listitem")).toHaveCount(1);
	await expect(podium.getByLabel("Place 1")).toBeVisible();
	await expect(page.getByRole("heading", { name: /^You scored \d+ points$/ })).toBeVisible();
	await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
});
