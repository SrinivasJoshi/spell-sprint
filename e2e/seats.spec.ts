import { expect, test, type Browser, type Page, type WebSocketRoute } from "@playwright/test";

/** A Private Room with its Host and one friend, both in the Lobby. */
async function privateRoomWithFriend(browser: Browser) {
	const contexts = [await browser.newContext(), await browser.newContext()];
	const [host, friend] = await Promise.all(contexts.map((c) => c.newPage()));
	await host.goto("/");
	await host.getByRole("button", { name: "Create Private Room" }).click();
	await expect(host).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
	return { contexts, host, friend, path: new URL(host.url()).pathname };
}

const roster = (page: Page) => page.getByRole("list", { name: "People in the Room" }).getByRole("listitem");

// Spec #11: Leave Room asks first, then gives up the place at once; the Host role passes on.
test("the Host leaves the Room, after confirming, and the friend becomes the Host", async ({ browser }) => {
	const { contexts, host, friend, path } = await privateRoomWithFriend(browser);
	await friend.goto(path);
	await expect(roster(host)).toHaveCount(2);
	await expect(friend.getByRole("button", { name: "Start" })).toHaveCount(0);

	await host.getByRole("button", { name: "Leave Room" }).click();
	const dialog = host.getByRole("alertdialog");
	await dialog.getByRole("button", { name: "Stay" }).click();
	await expect(roster(friend)).toHaveCount(2);

	await host.getByRole("button", { name: "Leave Room" }).click();
	await dialog.getByRole("button", { name: "Leave Room" }).click();
	await expect(host).toHaveURL(/\/$/);
	await expect(roster(friend)).toHaveCount(1);
	await expect(friend.getByRole("button", { name: "Start" })).toBeVisible();
	for (const c of contexts) await c.close();
});

// Spec #11: the browser reconnects by itself, with the same identity.
test("a dropped connection reconnects by itself and keeps the place in the Room", async ({ browser }) => {
	const { contexts, host, friend, path } = await privateRoomWithFriend(browser);
	const routes: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
	await friend.routeWebSocket(/\/api\/rooms\/[A-Z0-9]{6}\/ws/, (page) => routes.push({ page, server: page.connectToServer() }));
	await friend.goto(path);
	await expect(roster(host)).toHaveCount(2);

	// The network drops the socket, as a blip would.
	await routes[0].server.close();
	await routes[0].page.close();
	await expect.poll(() => routes.length).toBe(2);
	await expect(friend.getByRole("status").filter({ hasText: "Reconnecting…" })).toHaveCount(0);
	await expect(roster(friend)).toHaveCount(2);
	await expect(roster(host)).toHaveCount(2);
	await expect(friend.getByText(/^Waiting for .+ to start the Match\.$/)).toBeVisible();
	for (const c of contexts) await c.close();
});

// Spec #11: leaving while the connection is down still gives up the place at once, Host role included.
test("the Host leaves while reconnecting, and the friend becomes the Host at once, not 30 seconds later", async ({ browser }) => {
	const { contexts, host, friend, path } = await privateRoomWithFriend(browser);
	let blocked = false;
	const routes: { page: WebSocketRoute; server?: WebSocketRoute }[] = [];
	await host.routeWebSocket(/\/api\/rooms\/[A-Z0-9]{6}\/ws/, (page) => {
		// While blocked, the network refuses every attempt to reconnect.
		if (blocked) {
			routes.push({ page });
			return page.close();
		}
		routes.push({ page, server: page.connectToServer() });
	});
	await host.reload();
	await friend.goto(path);
	await expect(roster(friend)).toHaveCount(2);

	blocked = true;
	await routes.at(-1)!.server!.close();
	await routes.at(-1)!.page.close();
	await expect(host.getByRole("status").filter({ hasText: "Reconnecting…" })).toBeVisible();
	// A few refused attempts in, the next retry is seconds away: leaving now can't ride on it.
	const before = routes.length;
	await expect.poll(() => routes.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 3);

	blocked = false;
	await host.getByRole("button", { name: "Leave Room" }).click();
	await host.getByRole("alertdialog").getByRole("button", { name: "Leave Room" }).click();
	await expect(host).toHaveURL(/\/$/);
	await expect(roster(friend)).toHaveCount(1, { timeout: 5_000 });
	await expect(friend.getByRole("button", { name: "Start" })).toBeVisible({ timeout: 5_000 });
	for (const c of contexts) await c.close();
});
