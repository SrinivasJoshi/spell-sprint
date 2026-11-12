import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MAX_PEOPLE_PER_ROOM, ROUNDS_PER_MATCH } from "../../src/shared/rooms";
import { allSpellings, seedTestCatalogue, wordFor } from "./support/catalogue";
import { advanceRoom } from "./support/clock";
import { issueGuest } from "./support/http";
import { joinRoom, privateRoom, toRound1 } from "./support/match";
import { openRoomSocket, type RoomSocket } from "./support/room-socket";

beforeAll(seedTestCatalogue);

const open: RoomSocket[] = [];
afterEach(() => {
	for (const s of open.splice(0)) s.close();
});

/** A Private Room whose sockets this file closes after each test. */
async function openPrivateRoom(others: number) {
	const r = await privateRoom(others);
	open.push(...r.sockets);
	return r;
}

describe("a Private Room", () => {
	it("lets anyone with its code join, and shows everyone the live roster with the Host", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		for (const s of sockets) {
			const { room } = await s.next("room", (m) => m.room.roster.length === 3);
			expect(room).toMatchObject({ code, kind: "private", hostId: guests[0].guest.id, phase: "lobby" });
			expect(room.roster.map((p) => p.id)).toEqual(guests.map((g) => g.guest.id));
		}
	});

	it("refuses a non-Host's start, keeping their socket open", async () => {
		const { sockets } = await openPrivateRoom(1);
		sockets[1].send({ type: "start" });
		expect(await sockets[1].next("rejected")).toMatchObject({ reason: "not_host" });
		expect(sockets[1].closed).toBe(false);
		expect(sockets[0].got("countdown")).toBe(false);
	});

	it("refuses the person beyond its capacity with a clear message", async () => {
		const { code } = await openPrivateRoom(MAX_PEOPLE_PER_ROOM - 1);
		const late = await openRoomSocket(code, (await issueGuest()).token);
		expect(await late.next("refused")).toMatchObject({ reason: "full", message: expect.stringMatching(/full/) });
		expect(late.got("room")).toBe(false);
	});

	it("lets someone already in a full Room open another tab", async () => {
		const { code, guests } = await openPrivateRoom(MAX_PEOPLE_PER_ROOM - 1);
		const tab = await joinRoom(code, guests[3]);
		open.push(tab);
		expect(tab.got("refused")).toBe(false);
		expect((await tab.next("room")).room.roster).toHaveLength(MAX_PEOPLE_PER_ROOM);
	});
});

describe("a multiplayer Round", () => {
	it("tells everyone who solved it, never the word; guess results go only to the guesser", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		const word = await toRound1(code, sockets);
		sockets[1].send({ type: "guess", guess: "zzzz" });
		await sockets[1].next("guess-result");
		sockets[1].send({ type: "guess", guess: word });
		await sockets[1].next("guess-result", (m) => m.result === "correct");

		for (const s of sockets) expect(await s.next("solved")).toEqual({ type: "solved", playerId: guests[1].guest.id });
		for (const s of [sockets[0], sockets[2]]) {
			expect(s.got("guess-result")).toBe(false);
			expect(s.got("round-end")).toBe(false);
			const sent = JSON.stringify(s.received);
			for (const spelling of allSpellings()) expect(sent).not.toContain(spelling);
		}
	});

	it("ends early once every Player has solved it", async () => {
		const { code, sockets } = await openPrivateRoom(1);
		const word = await toRound1(code, sockets);
		sockets[0].send({ type: "guess", guess: word });
		await sockets[1].next("solved");
		expect(sockets[1].got("round-end")).toBe(false);

		sockets[1].send({ type: "guess", guess: word });
		for (const s of sockets) expect(await s.next("round-end")).toMatchObject({ round: 1, word });
	});

	it("ranks every Player on the Podium", async () => {
		const { code, guests, sockets } = await openPrivateRoom(2);
		sockets[0].send({ type: "start" });
		for (let round = 1; round <= ROUNDS_PER_MATCH; round++) {
			await sockets[0].next("countdown", (m) => m.round === round);
			await advanceRoom(code);
			const r = await sockets[0].next("round", (m) => m.round === round);
			// Only the third Player solves anything.
			sockets[2].send({ type: "guess", guess: wordFor(r.pictureUrl) });
			await sockets[0].next("solved", () => sockets[0].received.filter((m) => m.type === "solved").length === round);
			await advanceRoom(code);
			await sockets[0].next("round-end", (m) => m.round === round);
			await advanceRoom(code);
		}
		const { podium } = await sockets[1].next("podium");
		expect(podium.map((e) => e.playerId)).toEqual([guests[2].guest.id, guests[0].guest.id, guests[1].guest.id]);
		expect(podium.map((e) => e.place)).toEqual([1, 2, 2]);

		// Play again is the Host's alone.
		sockets[1].send({ type: "start" });
		expect(await sockets[1].next("rejected")).toMatchObject({ reason: "not_host" });
	});

	it("doesn't count someone who arrived mid-Match as a Player: their guesses score nothing and don't hold the Round", async () => {
		const { code, sockets } = await openPrivateRoom(1);
		const word = await toRound1(code, sockets);
		const late = await joinRoom(code, await issueGuest());
		open.push(late);
		late.send({ type: "guess", guess: word });
		for (const s of sockets) s.send({ type: "guess", guess: word });
		const end = await late.next("round-end");
		expect(Object.keys(end.points)).toHaveLength(2);
		expect(late.got("guess-result")).toBe(false);
	});
});
