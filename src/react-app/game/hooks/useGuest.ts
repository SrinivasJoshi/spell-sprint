import { useEffect, useState } from "react";
import { ensureGuest } from "@/api/guest";
import { isHandledHttpError } from "@/lib/http";
import type { GuestResponse } from "../../../shared/rooms";

let pending: Promise<GuestResponse> | undefined;

/**
 * This browser's Guest, fetched once per page load and shared by every caller:
 * undefined while it loads, null when it could not be had (the HTTP layer has
 * told the user why).
 */
export function useGuest(): GuestResponse | null | undefined {
	const [guest, setGuest] = useState<GuestResponse | null>();
	useEffect(() => {
		let live = true;
		pending ??= ensureGuest().catch((error: unknown) => {
			pending = undefined;
			throw error;
		});
		pending
			.then((issued) => live && setGuest(issued))
			.catch((error: unknown) => {
				if (live) setGuest(null);
				if (!isHandledHttpError(error)) throw error;
			});
		return () => {
			live = false;
		};
	}, []);
	return guest;
}
