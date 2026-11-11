import { beforeAll, describe, expect, it } from "vitest";
import { COUNTDOWN_MS, podium } from "../../src/shared/rooms";
import { allSpellings, seedTestCatalogue } from "./support/catalogue";
import { playMatch, soloRoom } from "./support/match";

beforeAll(seedTestCatalogue);

const players = [
	{ id: "a", name: "Ada" },
	{ id: "b", name: "Bo" },
	{ id: "c", name: "Cy" },
	{ id: "d", name: "Di" },
];

describe("placings", () => {
	it("lists every Player, most points first, with their place", () => {
		expect(podium(players, { a: 120, b: 300, c: 0, d: 250 })).toEqual([
			{ playerId: "b", name: "Bo", points: 300, place: 1 },
			{ playerId: "d", name: "Di", points: 250, place: 2 },
			{ playerId: "a", name: "Ada", points: 120, place: 3 },
			{ playerId: "c", name: "Cy", points: 0, place: 4 },
		]);
	});

	it("gives equal points a shared place and skips the places they take (1, 1, 3)", () => {
		expect(podium(players.slice(0, 3), { a: 200, b: 200, c: 90 }).map((e) => [e.playerId, e.place])).toEqual([
			["a", 1],
			["b", 1],
			["c", 3],
		]);
		expect(podium(players, { a: 50, b: 400, c: 50, d: 50 }).map((e) => e.place)).toEqual([1, 2, 2, 2]);
	});

	it("counts a Player with no points recorded as 0", () => {
		expect(podium(players.slice(0, 2), { a: 10 })).toEqual([
			{ playerId: "a", name: "Ada", points: 10, place: 1 },
			{ playerId: "b", name: "Bo", points: 0, place: 2 },
		]);
	});
});

describe("Play again", () => {
	it("starts a new Match in the same Room from the Podium, scores from 0", async () => {
		const { code, socket, guest } = await soloRoom();
		await playMatch(code, socket, () => true);

		const again = await playMatch(code, socket);
		expect(again.messages.find((m) => m.type === "room")).toMatchObject({ room: { phase: "playing" } });
		expect(again.messages.find((m) => m.type === "countdown")).toEqual({ type: "countdown", round: 1, ms: COUNTDOWN_MS });
		expect(again.podium).toEqual([{ playerId: guest.id, name: guest.name, points: 0, place: 1 }]);
		socket.close();
	});

	it("draws Words not yet used in the Room until none are left, then starts over", async () => {
		// The test Catalogue has 7 Words: 5 in Match 1 leaves 2 unused.
		expect(allSpellings()).toHaveLength(7);
		const { code, socket } = await soloRoom();
		const m1 = (await playMatch(code, socket)).words;
		const m2 = (await playMatch(code, socket)).words;
		const m3 = (await playMatch(code, socket)).words;
		for (const match of [m1, m2, m3]) expect(new Set(match).size).toBe(5);

		// Match 2 uses up the 2 left over, then starts the Catalogue over with 3 more.
		const leftAfter1 = allSpellings().filter((w) => !m1.includes(w));
		expect(m2).toEqual(expect.arrayContaining(leftAfter1));
		// The new round counts all of Match 2, so Match 3 brings the 2 Match 2 didn't play.
		expect(m3).toEqual(expect.arrayContaining(allSpellings().filter((w) => !m2.includes(w))));
		socket.close();
	});
});
