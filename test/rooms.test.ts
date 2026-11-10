import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src/worker/index";
import { ROOM_CODE_ALPHABET, roomSocketPath, type CreateRoomResponse, type GuestResponse, type ServerMessage } from "../src/shared/rooms";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
	app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, env);

async function issueGuest(token?: string): Promise<GuestResponse> {
	const res = await post("/api/guest", token === undefined ? {} : { token });
	expect(res.status).toBe(200);
	return (await res.json()) as GuestResponse;
}

let ipCounter = 0;
/** Each test creates from its own IP so the per-IP limit of one test never spills into another. */
const freshIp = () => `198.51.100.${++ipCounter}`;

async function createSoloRoom(token: string, ip = freshIp()): Promise<Response> {
	return post("/api/rooms", { kind: "solo", token }, { "CF-Connecting-IP": ip });
}

/** A fake browser: opens the Room's WebSocket and collects what it receives. */
async function openSocket(code: string, token: string) {
	const res = await app.request(roomSocketPath(code, token), { headers: { Upgrade: "websocket" } }, env);
	expect(res.status).toBe(101);
	const ws = res.webSocket!;
	const received: ServerMessage[] = [];
	const waiters: Array<() => void> = [];
	let closed = false;
	ws.addEventListener("message", (event) => {
		received.push(JSON.parse(event.data as string) as ServerMessage);
		waiters.splice(0).forEach((wake) => wake());
	});
	ws.addEventListener("close", () => {
		closed = true;
		waiters.splice(0).forEach((wake) => wake());
	});
	ws.accept();
	return {
		received,
		get closed() {
			return closed;
		},
		/** The first message received (now or later) that matches. */
		async next<T extends ServerMessage["type"]>(type: T, where: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
			for (;;) {
				const found = received.find((m): m is Extract<ServerMessage, { type: T }> => m.type === type && where(m as Extract<ServerMessage, { type: T }>));
				if (found) return found;
				await new Promise<void>((resolve, reject) => {
					waiters.push(resolve);
					setTimeout(() => reject(new Error(`no "${type}" message; got ${JSON.stringify(received)}`)), 2000);
				});
			}
		},
		close: () => ws.close(1000),
	};
}

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
		const [payload, signature] = first.token.split(".");
		const forged = btoa(JSON.stringify({ ...first.guest, name: "Impostor01" })).replace(/=+$/, "");
		const again = await issueGuest(`${forged}.${signature}`);
		expect(again.guest.id).not.toBe(first.guest.id);
		expect(payload).not.toBe(forged);
	});
});

describe("Solo Rooms", () => {
	it("creates a Room with a code free of look-alike characters", async () => {
		const { token } = await issueGuest();
		const res = await createSoloRoom(token);
		expect(res.status).toBe(200);
		const { code, url } = (await res.json()) as CreateRoomResponse;
		expect(code).toMatch(/^[A-Z2-9]{6}$/);
		expect(code).not.toMatch(/[01OIL]/);
		expect([...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch))).toBe(true);
		expect(url).toBe(`/r/${code}`);
	});

	it("puts its creator in the roster, marked as a Guest", async () => {
		const { token, guest } = await issueGuest();
		const { code } = (await (await createSoloRoom(token)).json()) as CreateRoomResponse;
		const socket = await openSocket(code, token);
		const state = await socket.next("room");
		expect(state.room).toEqual({ code, kind: "solo", roster: [{ id: guest.id, name: guest.name, identity: "guest" }] });
		socket.close();
	});

	it("refuses a WebSocket with a missing or tampered Guest token", async () => {
		const { token } = await issueGuest();
		const { code } = (await (await createSoloRoom(token)).json()) as CreateRoomResponse;
		const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
		for (const bad of ["", tampered]) {
			const socket = await openSocket(code, bad);
			const refusal = await socket.next("refused");
			expect(refusal.reason).toBe("bad_identity");
			expect(socket.received.some((m) => m.type === "room")).toBe(false);
		}
	});

	it("refuses anyone but its creator, with a clear message, and keeps them out of the roster", async () => {
		const creator = await issueGuest();
		const other = await issueGuest();
		const { code } = (await (await createSoloRoom(creator.token)).json()) as CreateRoomResponse;
		const mine = await openSocket(code, creator.token);
		await mine.next("room");

		const theirs = await openSocket(code, other.token);
		const refusal = await theirs.next("refused");
		expect(refusal).toMatchObject({ reason: "solo", message: expect.stringMatching(/Solo Room/) });
		expect(theirs.received.some((m) => m.type === "room")).toBe(false);
		expect(mine.received.filter((m) => m.type === "room").every((m) => m.type === "room" && m.room.roster.length === 1)).toBe(true);
		mine.close();
	});

	it("refuses a code no Room was created under", async () => {
		const { token } = await issueGuest();
		const socket = await openSocket("ZZZZZZ", token);
		expect((await socket.next("refused")).reason).toBe("not_found");
	});

	it("refuses creation beyond the per-IP limit with a message for the user", async () => {
		const { token } = await issueGuest();
		const ip = freshIp();
		for (let i = 0; i < 10; i++) expect((await createSoloRoom(token, ip)).status).toBe(200);
		const refused = await createSoloRoom(token, ip);
		expect(refused.status).toBe(429);
		expect(await refused.json()).toMatchObject({ code: "room_rate_limited", error: expect.stringMatching(/wait a minute/) });
		// Another address is not affected.
		expect((await createSoloRoom(token)).status).toBe(200);
	});

	it("refuses creation without a valid Guest token", async () => {
		expect((await createSoloRoom("not-a-token")).status).toBe(401);
		expect((await post("/api/rooms", { kind: "solo", token: 5 }, { "CF-Connecting-IP": freshIp() })).status).toBe(401);
	});
});
