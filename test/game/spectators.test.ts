import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_PEOPLE_PER_ROOM, ROUND_TIME_MS, ROUNDS_PER_MATCH } from "../../src/shared/rooms";
import { seedTestCatalogue, wordFor } from "./support/catalogue";
import { advanceRoom } from "./support/clock";
import { issueGuest } from "./support/http";
import { joinRoom, privateRoom, toRound1 } from "./support/match";
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

async function join(code: string) {
	const guest = await issueGuest();
	const socket = await joinRoom(code, guest);
	open.push(socket);
	return { guest, socket };
}

describe("someone who joins mid-Match", () => {
	it("is a Spectator, shown the Round in play with the time it has left and who has solved it", async () => {
		const { code, guests, sockets } = await openPrivateRoom(1);
		vi.useFakeTimers({ toFake: ["Date"] });
		const word = await toRound1(code, sockets);
		sockets[1].send({ type: "guess", guess: word });
		await sockets[0].next("solved");
		vi.setSystemTime(Date.now() + 5_000);

		const { guest, socket } = await join(code);
		const { room } = await socket.next("room");
		expect(room.phase).toBe("playing");
		expect(room.spectatorIds).toEqual([guest.guest.id]);
		const round = await socket.next("round");
		expect(round).toMatchObject({ round: 1, timeLimitMs: ROUND_TIME_MS });
		expect(round.timeLeftMs).toBeLessThanOrEqual(ROUND_TIME_MS - 5_000);
		expect(round.timeLeftMs).toBeGreaterThan(0);
		expect(await socket.next("solved")).toEqual({ type: "solved", playerId: guests[1].guest.id });

		// Everyone else learns there is a Spectator too.
		await sockets[0].next("room", (m) => m.room.spectatorIds.includes(guest.guest.id));
	});

	it("is shown the countdown or the reveal, whichever is on", async () => {
		const { code, sockets } = await openPrivateRoom(0);
		sockets[0].send({ type: "start" });
		await sockets[0].next("countdown");
		const early = await join(code);
		expect(await early.socket.next("countdown")).toMatchObject({ round: 1 });

		await advanceRoom(code);
		await sockets[0].next("round");
		await advanceRoom(code);
		const end = await sockets[0].next("round-end");
		const late = await join(code);
		expect(await late.socket.next("round-end")).toMatchObject({ round: 1, word: end.word });
	});

	it("can't guess: the guess is refused and scores nothing", async () => {
		const { code, sockets } = await openPrivateRoom(1);
		const word = await toRound1(code, sockets);
		const { socket } = await join(code);
		socket.send({ type: "guess", guess: word });
		expect(await socket.next("rejected")).toMatchObject({ reason: "spectator" });
		expect(socket.got("guess-result")).toBe(false);
		expect(sockets[0].got("solved")).toBe(false);
	});

	it("as a Player who already solved the Round (a reload), is still a Player: their guess is answered, not refused", async () => {
		const { code, guests, sockets } = await openPrivateRoom(1);
		const word = await toRound1(code, sockets);
		sockets[1].send({ type: "guess", guess: word });
		await sockets[1].next("guess-result");

		const reloaded = await joinRoom(code, guests[1]);
		open.push(reloaded);
		expect((await reloaded.next("room")).room.spectatorIds).toEqual([]);
		await reloaded.next("round");
		reloaded.send({ type: "guess", guess: word });
		expect(await reloaded.next("guess-result")).toMatchObject({ result: "correct" });
	});

	it("counts toward the Room's 10 people", async () => {
		const { code, sockets } = await openPrivateRoom(MAX_PEOPLE_PER_ROOM - 3);
		await toRound1(code, sockets);
		await join(code);
		await join(code);
		const beyond = await openRoomSocket(code, (await issueGuest()).token);
		open.push(beyond);
		expect(await beyond.next("refused")).toMatchObject({ reason: "full" });
	});
});

describe("the next Match", () => {
	it("turns every Spectator into a Player when the Host starts it from the Podium", async () => {
		const { code, sockets } = await openPrivateRoom(0);
		await toRound1(code, sockets);
		const other = (await join(code)).guest;
		const { guest, socket } = await join(code);
		for (let round = 1; round <= ROUNDS_PER_MATCH; round++) {
			if (round > 1) {
				await sockets[0].next("countdown", (m) => m.round === round);
				await advanceRoom(code);
			}
			await advanceRoom(code);
			await sockets[0].next("round-end", (m) => m.round === round);
			await advanceRoom(code);
		}
		const { podium } = await socket.next("podium");
		// The Host alone played it.
		expect(podium).toHaveLength(1);
		expect(podium.map((e) => e.playerId)).not.toContain(guest.guest.id);
		expect(podium.map((e) => e.playerId)).not.toContain(other.guest.id);

		const from = socket.received.length;
		const since = (m: unknown) => socket.received.indexOf(m as never) >= from;
		sockets[0].send({ type: "start" });
		const { room } = await socket.next("room", (m) => since(m) && m.room.phase === "playing");
		expect(room.spectatorIds).toEqual([]);
		await socket.next("countdown", since);
		await advanceRoom(code);
		const r = await socket.next("round", since);
		socket.send({ type: "guess", guess: wordFor(r.pictureUrl) });
		expect(await socket.next("guess-result")).toMatchObject({ result: "correct" });
	});
});
