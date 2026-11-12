import { expect, test } from "@playwright/test";

// Spec #9: a Private Room with two browsers, the second joining by code on the home page.
test("a friend joins a Private Room by code; only the Host can start", async ({ browser }) => {
	const contexts = [await browser.newContext(), await browser.newContext()];
	const [hostPage, friend] = await Promise.all(contexts.map((c) => c.newPage()));
	await hostPage.goto("/");
	await hostPage.getByRole("button", { name: "Create Private Room" }).click();
	await expect(hostPage).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
	const code = hostPage.url().split("/").at(-1)!;
	await expect(hostPage.getByText("Private Room")).toBeVisible();

	await friend.goto("/");
	await friend.getByLabel("Join with a code").fill(code.toLowerCase());
	await friend.getByRole("button", { name: "Join" }).click();
	await expect(friend).toHaveURL(new RegExp(`/r/${code}$`));

	for (const page of [hostPage, friend]) await expect(page.getByRole("list", { name: "People in the Room" }).getByRole("listitem")).toHaveCount(2);
	await expect(friend.getByText(/^Waiting for .+ to start the Match\.$/)).toBeVisible();
	await expect(friend.getByRole("button", { name: "Start" })).toHaveCount(0);
	await expect(hostPage.getByRole("button", { name: "Start" })).toBeVisible();
	for (const c of contexts) await c.close();
});

test("an unknown code shows a clear message", async ({ page }) => {
	await page.goto("/");
	await page.getByLabel("Join with a code").fill("ZZZZZZ");
	await page.getByRole("button", { name: "Join" }).click();
	await expect(page.getByText("There is no Room with that code.")).toBeVisible();
});
