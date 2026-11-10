import { describe, expect, it } from "vitest";
import { issueGuest } from "./support/http";

describe("Guest tokens", () => {
	it("issues a visitor without a token a signed Guest with a generated handle", async () => {
		const { token, guest } = await issueGuest();
		expect(token).toEqual(expect.any(String));
		expect(guest.id).toEqual(expect.any(String));
		expect(guest.name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/);
	});

	it("keeps the same Guest when the browser sends its token back", async () => {
		const first = await issueGuest();
		const again = await issueGuest(first.token);
		expect(again.guest).toEqual(first.guest);
		expect(again.token).toBe(first.token);
	});

	it("issues a new Guest for a tampered token", async () => {
		const first = await issueGuest();
		const signature = first.token.split(".")[1];
		const forged = btoa(JSON.stringify({ ...first.guest, name: "Impostor01" })).replace(/=+$/, "");
		const again = await issueGuest(`${forged}.${signature}`);
		expect(again.guest.id).not.toBe(first.guest.id);
	});
});
