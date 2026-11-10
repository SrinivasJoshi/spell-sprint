import { http } from "@/lib/http";
import type { GuestRequest, GuestResponse } from "../../shared/rooms";

const STORAGE_KEY = "blankrace.guestToken";

/**
 * This browser's Guest: the stored token goes to the Worker, which returns it
 * when it is still valid (same Guest after a reload) or issues a new one.
 */
export async function ensureGuest(): Promise<GuestResponse> {
	const token = localStorage.getItem(STORAGE_KEY) ?? undefined;
	const res = await http("/api/guest", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token } satisfies GuestRequest),
	});
	const issued = (await res.json()) as GuestResponse;
	localStorage.setItem(STORAGE_KEY, issued.token);
	return issued;
}
