import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { expect } from "vitest";

/**
 * Moves a Room on to its next step (end of the countdown, the Round or the
 * reveal) by running its pending alarm now, rather than waiting for it.
 */
export async function advanceRoom(code: string): Promise<void> {
	expect(await runDurableObjectAlarm(env.ROOM.get(env.ROOM.idFromName(code)))).toBe(true);
}
