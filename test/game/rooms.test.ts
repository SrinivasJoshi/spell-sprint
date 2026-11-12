import { describe, expect, it } from "vitest";
import type { CreateRoomResponse } from "../../src/shared/rooms";
import { createRoom, freshIp, issueGuest, post, requestRoom } from "./support/http";
import { openRoomSocket } from "./support/room-socket";

describe("creating a Solo Room", () => {
	it("returns a code free of look-alike characters, and the Room's page", async () => {
		const { token } = await issueGuest();
		const res = await requestRoom(token);
		expect(res.status).toBe(200);
		const { code, url } = (await res.json()) as CreateRoomResponse;
		expect(code).toMatch(/^[A-Z2-9]{6}$/);
		expect(code).not.toMatch(/[01OIL]/);
		expect(url).toBe(`/r/${code}`);
	});

	it("refuses creation beyond the per-IP limit with a message for the user", async () => {
		const { token } = await issueGuest();
		const ip = freshIp();
		for (let i = 0; i < 10; i++) expect((await requestRoom(token, { ip })).status).toBe(200);
		const refused = await requestRoom(token, { ip });
		expect(refused.status).toBe(429);
		expect(await refused.json()).toMatchObject({ code: "room_rate_limited", error: expect.stringMatching(/wait a minute/) });
		// Another address is not affected.
		expect((await requestRoom(token)).status).toBe(200);
	});

	it("refuses creation without a valid Guest token", async () => {
		expect((await requestRoom("not-a-token")).status).toBe(401);
		expect((await post("/api/rooms", { kind: "solo", token: 5 }, { "CF-Connecting-IP": freshIp() })).status).toBe(401);
	});
});

describe("joining a Solo Room", () => {
	it("puts its creator in the roster, marked as a Guest", async () => {
		const { token, guest } = await issueGuest();
		const code = await createRoom(token);
		const socket = await openRoomSocket(code, token);
		const state = await socket.next("room");
		expect(state.room).toEqual({ code, kind: "solo", hostId: guest.id, roster: [{ id: guest.id, name: guest.name, identity: "guest" }], awayIds: [], spectatorIds: [], phase: "lobby" });
		socket.close();
	});

	it("refuses a WebSocket with a missing or tampered Guest token", async () => {
		const { token } = await issueGuest();
		const code = await createRoom(token);
		const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
		for (const bad of ["", tampered]) {
			const socket = await openRoomSocket(code, bad);
			expect((await socket.next("refused")).reason).toBe("bad_identity");
			expect(socket.got("room")).toBe(false);
		}
	});

	it("refuses anyone but its creator, with a clear message, and keeps them out of the roster", async () => {
		const creator = await issueGuest();
		const other = await issueGuest();
		const code = await createRoom(creator.token);
		const mine = await openRoomSocket(code, creator.token);
		await mine.next("room");

		const theirs = await openRoomSocket(code, other.token);
		expect(await theirs.next("refused")).toMatchObject({ reason: "solo", message: expect.stringMatching(/Solo Room/) });
		expect(theirs.got("room")).toBe(false);
		expect(mine.received.every((m) => m.type !== "room" || m.room.roster.length === 1)).toBe(true);
		mine.close();
	});

	it("refuses a code no Room was created under", async () => {
		const { token } = await issueGuest();
		const socket = await openRoomSocket("ZZZZZZ", token);
		expect((await socket.next("refused")).reason).toBe("not_found");
	});
});
