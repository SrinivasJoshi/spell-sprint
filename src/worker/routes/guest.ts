import { Hono } from "hono";
import type { GuestRequest, GuestResponse } from "../../shared/rooms";
import { newGuest, signGuestToken, verifyGuestToken } from "../lib/guest-token";
import { background } from "../lib/route-kind";
import type { AppBindings } from "../types/context";

export const guest = new Hono<AppBindings>();

/**
 * Issue or refresh a Guest token. The browser calls it on every load with the
 * token it stored: a valid one comes back unchanged, so a reload keeps the
 * same Guest; anything else gets a new Guest. Background: the page calls it
 * without the user doing anything.
 */
guest.post("/", background, async (c) => {
	const body = (await c.req.json<GuestRequest>().catch(() => ({}))) as GuestRequest;
	const token = typeof body.token === "string" ? body.token : undefined;
	const existing = await verifyGuestToken(c.env, token);
	if (existing && token) return c.json<GuestResponse>({ token, guest: existing });
	const created = newGuest();
	return c.json<GuestResponse>({ token: await signGuestToken(c.env, created), guest: created });
});
