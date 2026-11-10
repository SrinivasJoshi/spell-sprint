import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COUNTDOWN_MS, ROUND_TIME_MS } from "../../src/shared/rooms";
import { allSpellings, seedTestCatalogue, wordFor } from "./support/catalogue";
import { advanceRoom } from "./support/clock";
import { createRoom, issueGuest } from "./support/http";
import { openRoomSocket } from "./support/room-socket";

beforeAll(seedTestCatalogue);
afterEach(() => vi.useRealTimers());

/** A Guest alone in their Solo Room, before the Match. */
async function soloRoom() {
	const { token, guest } = await issueGuest();
	const code = await createRoom(token);
	const socket = await openRoomSocket(code, token);
	await socket.next("room");
	return { code, socket, guest };
}

/** A Solo Room whose Match has reached Round 1, with the server's clock frozen at the Round's start. */
async function inRound1() {
	const solo = await soloRoom();
	solo.socket.send({ type: "start" });
	await solo.socket.next("countdown");
	vi.useFakeTimers({ toFake: ["Date"] });
	await advanceRoom(solo.code);
	const round = await solo.socket.next("round");
	return { ...solo, round, word: wordFor(round.pictureUrl) };
}

describe("starting a Solo Match", () => {
	it("counts down, then starts Round 1 with the picture and the Blanks but never the word", async () => {
		const { code, socket } = await soloRoom();
		socket.send({ type: "start" });
		expect(await socket.next("countdown")).toEqual({ type: "countdown", round: 1, ms: COUNTDOWN_MS });
		expect(socket.got("round")).toBe(false);

		await advanceRoom(code);
		const round = await socket.next("round");
		expect(round).toMatchObject({ round: 1, rounds: 5, timeLimitMs: ROUND_TIME_MS });
		expect(round.pictureUrl).toMatch(/^\/api\/pictures\/[0-9a-f]+$/);
		expect(round.slots.length).toBeGreaterThan(0);
		expect(round.slots.every((s) => s.kind === "typed")).toBe(true);
		const sent = JSON.stringify(socket.received);
		for (const spelling of allSpellings()) expect(sent).not.toContain(spelling);
		socket.close();
	});
});

describe("guessing", () => {
	it("scores a correct guess on the server's clock: 50 plus up to 50 for the time left", async () => {
		const { socket, word, guest } = await inRound1();
		vi.advanceTimersByTime(6_000);
		socket.send({ type: "guess", guess: word.toUpperCase() });
		// 9 s of 15 left: 50 + floor(50 × 9 ÷ 15) = 80.
		expect(await socket.next("guess-result")).toEqual({ type: "guess-result", result: "correct", points: 80 });
		expect(await socket.next("solved")).toEqual({ type: "solved", playerId: guest.id });
		socket.close();
	});

	it("tells the guesser a wrong guess, with no penalty and no limit on attempts", async () => {
		const { socket, word } = await inRound1();
		for (let i = 0; i < 3; i++) socket.send({ type: "guess", guess: "zzz" });
		socket.send({ type: "guess", guess: word });
		const correct = await socket.next("guess-result", (m) => m.result === "correct");
		expect(correct).toEqual({ type: "guess-result", result: "correct", points: 100 });
		expect(socket.received.filter((m) => m.type === "guess-result" && m.result === "wrong")).toHaveLength(3);
		socket.close();
	});

	it("locks a Round once solved: later guesses get no answer and score nothing more", async () => {
		const { code, socket, word, guest } = await inRound1();
		socket.send({ type: "guess", guess: word });
		await socket.next("guess-result");
		socket.send({ type: "guess", guess: word });
		socket.send({ type: "guess", guess: "zzz" });
		await advanceRoom(code);
		const end = await socket.next("round-end");
		expect(end.points).toEqual({ [guest.id]: 100 });
		expect(socket.received.filter((m) => m.type === "guess-result")).toHaveLength(1);
		socket.close();
	});

	it("doesn't score a guess that arrives after the time limit, and ends the Round at once", async () => {
		const { socket, word, guest } = await inRound1();
		vi.advanceTimersByTime(15_000);
		socket.send({ type: "guess", guess: word });
		expect((await socket.next("round-end")).points).toEqual({ [guest.id]: 0 });
		expect(socket.got("guess-result")).toBe(false);
		socket.close();
	});
});

describe("the end of a Round", () => {
	it("at the time limit, reveals the word, scores an unsolved Round 0 and sends the next picture to load", async () => {
		const { code, socket, word, guest } = await inRound1();
		await advanceRoom(code);
		const end = await socket.next("round-end");
		expect(end).toMatchObject({ round: 1, word, points: { [guest.id]: 0 }, scores: { [guest.id]: 0 }, ms: 5_000 });
		expect(end.nextPictureUrl).toMatch(/^\/api\/pictures\/[0-9a-f]+$/);

		// After the reveal, Round 2 counts down and shows that very picture.
		await advanceRoom(code);
		expect(await socket.next("countdown", (m) => m.round === 2)).toMatchObject({ round: 2 });
		await advanceRoom(code);
		const round2 = await socket.next("round", (m) => m.round === 2);
		expect(round2.pictureUrl).toBe(end.nextPictureUrl);
		expect(wordFor(round2.pictureUrl)).not.toBe(word);
		socket.close();
	});
});

describe("a whole Solo Match", () => {
	it("plays 5 Rounds of different Words, totals the points, then shows the Match as over", async () => {
		const { code, socket, guest } = await soloRoom();
		socket.send({ type: "start" });
		expect((await socket.next("room", (m) => m.room.phase === "playing")).room.phase).toBe("playing");
		const words = new Set<string>();
		for (let round = 1; round <= 5; round++) {
			await socket.next("countdown", (m) => m.round === round);
			await advanceRoom(code);
			const r = await socket.next("round", (m) => m.round === round);
			words.add(wordFor(r.pictureUrl));
			// Solve the odd Rounds only.
			if (round % 2 === 1) {
				socket.send({ type: "guess", guess: wordFor(r.pictureUrl) });
				await socket.next("solved", () => socket.received.filter((m) => m.type === "solved").length === Math.ceil(round / 2));
			}
			await advanceRoom(code);
			const end = await socket.next("round-end", (m) => m.round === round);
			expect(end.nextPictureUrl === null).toBe(round === 5);
			await advanceRoom(code);
		}
		expect(words.size).toBe(5);
		const over = await socket.next("match-over");
		const total = socket.received.reduce((sum, m) => (m.type === "guess-result" && m.result === "correct" ? sum + m.points : sum), 0);
		expect(over.scores).toEqual({ [guest.id]: total });
		expect(total).toBeGreaterThanOrEqual(150);
		expect((await socket.next("room", (m) => m.room.phase === "over")).room.phase).toBe("over");
		socket.close();
	});

	it("refuses a second start while the Match is under way, keeping the socket open", async () => {
		const { socket } = await soloRoom();
		socket.send({ type: "start" });
		await socket.next("countdown");
		socket.send({ type: "start" });
		expect(await socket.next("rejected")).toMatchObject({ reason: "in_progress" });
		expect(socket.closed).toBe(false);
		expect(socket.received.filter((m) => m.type === "countdown")).toHaveLength(1);
		socket.close();
	});
});
