import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SEAT_HOLD_MS } from "../../src/shared/rooms";
import { seedTestCatalogue } from "./support/catalogue";
import { advanceRoom, restartRoom } from "./support/clock";
import { createRoom, issueGuest } from "./support/http";
import { finishMatch, joinRoom, privateRoom, toRound1 } from "./support/match";
import { openRoomSocket, type RoomSocket } from "./support/room-socket";

beforeAll(seedTestCatalogue);

const open: RoomSocket[] = [];
afterEach(() => {
	vi.useRealTimers();
	for (const s of open.splice(0)) s.close();
});

async function openPrivateRoom(others: number) {
	const r = await privateRoom(others);
	open.push(...r.sockets);
	return r;
}

describe("a Player whose connection drops", () => {
	it("keeps their Seat for 30 seconds: reconnecting restores their score, solved state and the current Round", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		const word = await toRound1(code, sockets);
		const dropped = guests[1].guest.id;
		sockets[1].send({ type: "guess", guess: word });
		const { points } = (await sockets[1].next("guess-result")) as { points: number };

		sockets[1].close();
		const { room } = await sockets[0].next("room", (m) => m.room.awayIds.includes(dropped));
		expect(room.roster.map((p) => p.id)).toContain(dropped);

		const back = await joinRoom(code, guests[1]);
		open.push(back);
		const snapshot = (await back.next("room")).room;
		expect(snapshot.awayIds).toEqual([]);
		expect(snapshot.spectatorIds).toEqual([]);
		expect(snapshot.scores?.[dropped]).toBe(points);
		expect(await back.next("round")).toMatchObject({ round: 1 });
		expect(await back.next("solved")).toEqual({ type: "solved", playerId: dropped });
		expect(await back.next("guess-result")).toEqual({ type: "guess-result", result: "correct", points });
	});

	it("doesn't hold up the early end of a Round", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		const word = await toRound1(code, sockets);
		sockets[2].close();
		await sockets[0].next("room", (m) => m.room.awayIds.includes(guests[2].guest.id));
		sockets[0].send({ type: "guess", guess: word });
		sockets[1].send({ type: "guess", guess: word });
		expect(await sockets[0].next("round-end")).toMatchObject({ round: 1, word });
	});

	it("ends the Round when everyone still connected has solved it", async () => {
		const { code, sockets } = await openPrivateRoom(1);
		const word = await toRound1(code, sockets);
		sockets[0].send({ type: "guess", guess: word });
		await sockets[0].next("solved");
		sockets[1].close();
		expect(await sockets[0].next("round-end")).toMatchObject({ round: 1, word });
	});

	it("loses the Seat after 30 seconds: off the roster, back only as a Spectator, but their points stay on the Podium", async () => {
		const { code, guests, sockets } = await openPrivateRoom(1);
		vi.useFakeTimers({ toFake: ["Date"] });
		const word = await toRound1(code, sockets);
		const dropped = guests[1].guest.id;
		sockets[1].send({ type: "guess", guess: word });
		const { points } = (await sockets[1].next("guess-result")) as { points: number };
		sockets[1].close();
		await sockets[0].next("room", (m) => m.room.awayIds.includes(dropped));

		vi.setSystemTime(Date.now() + SEAT_HOLD_MS);
		await advanceRoom(code);
		const { room } = await sockets[0].next("room", (m) => m.room.phase === "playing" && !m.room.roster.some((p) => p.id === dropped));
		expect(room.awayIds).toEqual([]);

		const back = await joinRoom(code, guests[1]);
		open.push(back);
		expect((await back.next("room")).room.spectatorIds).toEqual([dropped]);

		const podium = await finishMatch(code, sockets[0], 1);
		expect(podium.find((e) => e.playerId === dropped)).toMatchObject({ points, place: 1 });
	});
});

describe("a Room everyone has left", () => {
	it("ends, mid-Match: back after 30 seconds, the Solo Room's creator is told it has ended", async () => {
		const guest = await issueGuest();
		const code = await createRoom(guest.token);
		const socket = await joinRoom(code, guest);
		vi.useFakeTimers({ toFake: ["Date"] });
		await toRound1(code, [socket]);
		socket.close();
		// The Room completes the close handshake once it has seen the drop.
		await vi.waitFor(() => expect(socket.closed).toBe(true));
		vi.setSystemTime(Date.now() + SEAT_HOLD_MS);
		await advanceRoom(code);

		const back = await openRoomSocket(code, guest.token);
		expect(await back.next("refused")).toMatchObject({ reason: "ended", message: expect.stringMatching(/ended/) });
		expect(back.got("room")).toBe(false);
	});

	it("ends in the Lobby too, once its last person leaves", async () => {
		const { code, guests, sockets } = await openPrivateRoom(1);
		sockets[1].send({ type: "leave" });
		await sockets[0].next("room", (m) => m.room.roster.length === 1 && m.room.roster[0].id === guests[0].guest.id && sockets[1].closed);
		sockets[0].send({ type: "leave" });
		await vi.waitFor(() => expect(sockets[0].closed).toBe(true));
		const back = await openRoomSocket(code, guests[0].token);
		expect(await back.next("refused")).toMatchObject({ reason: "ended" });
	});

	it("ends with no Match and no alarm left when its last person leaves right after starting", async () => {
		const guest = await issueGuest();
		const code = await createRoom(guest.token);
		const socket = await joinRoom(code, guest);
		const tab = await joinRoom(code, guest);
		socket.send({ type: "start" });
		tab.send({ type: "leave" });
		await vi.waitFor(() => expect(socket.closed && tab.closed).toBe(true));
		const back = await openRoomSocket(code, guest.token);
		expect(await back.next("refused")).toMatchObject({ reason: "ended" });
		expect(await runDurableObjectAlarm(env.ROOM.get(env.ROOM.idFromName(code)))).toBe(false);
	});

	it("but with Spectators still there, its abandoned Match gives way to the Lobby, one of them Host", async () => {
		const { code, sockets } = await openPrivateRoom(0);
		await toRound1(code, sockets);
		const watcher = await issueGuest();
		const socket = await joinRoom(code, watcher);
		open.push(socket);
		sockets[0].send({ type: "leave" });
		const { room } = await socket.next("room", (m) => m.room.phase === "lobby");
		expect(room).toMatchObject({ hostId: watcher.guest.id, spectatorIds: [] });
		socket.send({ type: "start" });
		expect(await socket.next("countdown")).toMatchObject({ round: 1 });
	});
});

describe("a Room that restarts (a deploy)", () => {
	it("counts whoever doesn't come back as away: they don't hold up the Round, and lose the Seat after 30 seconds", async () => {
		const { code, guests, sockets } = await openPrivateRoom(1);
		vi.useFakeTimers({ toFake: ["Date"] });
		const word = await toRound1(code, sockets);
		await restartRoom(code);

		const back = await joinRoom(code, guests[0]);
		open.push(back);
		expect((await back.next("room")).room.awayIds).toEqual([guests[1].guest.id]);
		back.send({ type: "guess", guess: word });
		expect(await back.next("round-end")).toMatchObject({ round: 1, word });

		vi.setSystemTime(Date.now() + SEAT_HOLD_MS);
		await advanceRoom(code);
		const { room } = await back.next("room", (m) => m.room.roster.length === 1);
		expect(room.roster.map((p) => p.id)).toEqual([guests[0].guest.id]);
	});
});

describe("Leave Room", () => {
	it("gives up the Seat at once: off the roster, not holding up the Round, points still on the Podium", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		const word = await toRound1(code, sockets);
		const leaver = guests[2].guest.id;
		sockets[2].send({ type: "guess", guess: word });
		const { points } = (await sockets[2].next("guess-result")) as { points: number };

		sockets[2].send({ type: "leave" });
		const { room } = await sockets[0].next("room", (m) => m.room.phase === "playing" && !m.room.roster.some((p) => p.id === leaver));
		expect(room.awayIds).toEqual([]);
		await vi.waitFor(() => expect(sockets[2].closed).toBe(true));

		sockets[0].send({ type: "guess", guess: word });
		sockets[1].send({ type: "guess", guess: word });
		const podium = await finishMatch(code, sockets[0], 1);
		expect(podium.find((e) => e.playerId === leaver)?.points).toBe(points);
	});
});

describe("the Host role", () => {
	it("passes at once to whoever has been in the Room longest when the Host leaves", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		// The first friend leaves and comes back: now the second has been here longer.
		sockets[1].send({ type: "leave" });
		await sockets[0].next("room", (m) => m.room.roster.length === 2 && !m.room.roster.some((p) => p.id === guests[1].guest.id));
		const back = await joinRoom(code, guests[1]);
		open.push(back);

		sockets[0].send({ type: "leave" });
		const { room } = await back.next("room", (m) => m.room.roster.length === 2);
		expect(room.hostId).toBe(guests[2].guest.id);
		sockets[2].send({ type: "start" });
		expect(await back.next("countdown")).toMatchObject({ round: 1 });
	});

	it("passes after the Host has been disconnected for 30 seconds, not before", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		vi.useFakeTimers({ toFake: ["Date"] });
		sockets[0].close();
		const { room } = await sockets[1].next("room", (m) => m.room.awayIds.length === 1);
		expect(room.hostId).toBe(guests[0].guest.id);

		vi.setSystemTime(Date.now() + SEAT_HOLD_MS);
		await advanceRoom(code);
		const after = await sockets[1].next("room", (m) => m.room.roster.length === 2 && !m.room.roster.some((p) => p.id === guests[0].guest.id));
		expect(after.room.hostId).toBe(guests[1].guest.id);
	});

	it("gives a new Host Play again at the Podium, and the old Host's start is refused", async () => {
		const { code, guests, sockets } = await openPrivateRoom(1);
		await toRound1(code, sockets);
		await advanceRoom(code);
		await finishMatch(code, sockets[1], 1);

		sockets[0].send({ type: "leave" });
		await sockets[1].next("room", (m) => m.room.phase === "over" && m.room.hostId === guests[1].guest.id);
		const old = await joinRoom(code, guests[0]);
		open.push(old);
		old.send({ type: "start" });
		expect(await old.next("rejected")).toMatchObject({ reason: "not_host" });

		sockets[1].send({ type: "start" });
		expect(await sockets[1].next("countdown", (m) => sockets[1].received.indexOf(m) > sockets[1].received.findIndex((x) => x.type === "podium"))).toMatchObject({ round: 1 });
	});
});
