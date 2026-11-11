import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { app } from "../../../src/worker/index";
import type { CreateRoomResponse, GuestResponse, RoomKind } from "../../../src/shared/rooms";

/** A JSON POST to the Worker, as the browser's `http()` would send it. */
export const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
	app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, env);

let ipCounter = 0;
/**
 * A client address no other test has used. Rate limits count per IP and their
 * counters outlive a single test, so every caller that creates Rooms gets its
 * own unless the test is about the limit.
 */
export const freshIp = () => {
	const n = ++ipCounter;
	return `10.0.${Math.floor(n / 256)}.${n % 256}`;
};

/** A Guest as a browser gets one: optionally sending back the token it stored. */
export async function issueGuest(token?: string): Promise<GuestResponse> {
	const res = await post("/api/guest", token === undefined ? {} : { token });
	expect(res.status).toBe(200);
	return (await res.json()) as GuestResponse;
}

/** `POST /api/rooms`, from a fresh IP unless one is given; the raw response, for tests about refusals. */
export async function requestRoom(token: string, options: { kind?: RoomKind; ip?: string } = {}): Promise<Response> {
	return post("/api/rooms", { kind: options.kind ?? "solo", token }, { "CF-Connecting-IP": options.ip ?? freshIp() });
}

/** A Room that must be created: its code. */
export async function createRoom(token: string, options: { kind?: RoomKind } = {}): Promise<string> {
	const res = await requestRoom(token, options);
	expect(res.status).toBe(200);
	return ((await res.json()) as CreateRoomResponse).code;
}

/** A call from a CLI script (`/api/cli/...`), with the CLI key unless another is given. */
export const cliRequest = (path: string, init: RequestInit = {}, key = env.CLI_API_KEY) =>
	app.request(`/api/cli${path}`, { ...init, headers: { "x-api-key": key, ...init.headers } }, env);
