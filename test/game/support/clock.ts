import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { expect } from "vitest";

/**
 * Moves a Room on to its next step (end of the countdown, the Round or the
 * reveal) by running its pending alarm now, rather than waiting for it.
 */
export async function advanceRoom(code: string): Promise<void> {
	expect(await runDurableObjectAlarm(env.ROOM.get(env.ROOM.idFromName(code)))).toBe(true);
}

/**
 * Restarts a Room the way a deploy or an eviction does: a new instance, its
 * in-memory state gone and every socket dropped without the Room hearing of it.
 */
export async function restartRoom(code: string): Promise<void> {
	await evictDurableObject(env.ROOM.get(env.ROOM.idFromName(code)), { webSockets: "close" });
}
