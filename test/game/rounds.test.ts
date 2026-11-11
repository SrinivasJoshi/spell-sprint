import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COUNTDOWN_MS, ROUND_TIME_MS, type Slot } from "../../src/shared/rooms";
import { allSpellings, seedTestCatalogue, wordFor } from "./support/catalogue";
import { advanceRoom } from "./support/clock";
import { playMatch, soloRoom } from "./support/match";

beforeAll(seedTestCatalogue);
afterEach(() => vi.useRealTimers());

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
		expect(round.slots).toHaveLength(wordFor(round.pictureUrl).length);
		const sent = JSON.stringify(socket.received);
		for (const spelling of allSpellings()) expect(sent).not.toContain(spelling);
		socket.close();
	});
});

describe("Hint Letters", () => {
	it("hard Words start with their Hint Letters as given slots; easy and medium Words have none", async () => {
		const { code, socket } = await soloRoom();
		// Two Matches go through the whole 7-Word test Catalogue.
		const first = await playMatch(code, socket);
		const second = await playMatch(code, socket);
		const layouts = new Map<string, Slot[]>();
		for (const m of [...first.messages, ...second.messages]) if (m.type === "round") layouts.set(wordFor(m.pictureUrl), m.slots);

		const t = { kind: "typed" };
		expect(layouts.get("umbrella")).toEqual([t, { kind: "given", char: "m" }, t, t, t, { kind: "given", char: "l" }, t, t]);
		expect(layouts.get("elephant")).toEqual([t, t, t, { kind: "given", char: "p" }, t, t, t, t]);
		for (const word of ["apple", "house", "guitar", "pencil", "penguin"]) {
			expect(layouts.get(word)).toEqual([...word].map(() => t));
		}
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

	it("answers Almost! (a Near Miss) for one wrong letter or one swap of neighbouring letters, without saying where", async () => {
		const { socket, word } = await inRound1();
		const last = word.length - 1;
		const guesses = {
			"one wrong letter": `z${word.slice(1)}`,
			"neighbours swapped": `${word[1]}${word[0]}${word.slice(2)}`,
			"two wrong letters": `zz${word.slice(2)}`,
			"far letters swapped": `${word[last]}${word.slice(1, last)}${word[0]}`,
			"a letter missing": word.slice(1),
			"a letter extra": `${word}z`,
		};
		for (const guess of Object.values(guesses)) socket.send({ type: "guess", guess });
		await socket.next("guess-result", () => socket.received.filter((m) => m.type === "guess-result").length === 6);
		const answers = socket.received.filter((m) => m.type === "guess-result");
		expect(Object.fromEntries(Object.keys(guesses).map((name, i) => [name, answers[i]]))).toEqual({
			"one wrong letter": { type: "guess-result", result: "near-miss" },
			"neighbours swapped": { type: "guess-result", result: "near-miss" },
			"two wrong letters": { type: "guess-result", result: "wrong" },
			"far letters swapped": { type: "guess-result", result: "wrong" },
			"a letter missing": { type: "guess-result", result: "wrong" },
			"a letter extra": { type: "guess-result", result: "wrong" },
		});
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
	it("plays 5 Rounds of different Words, then shows the Podium with the Player's points and place", async () => {
		const { code, socket, guest } = await soloRoom();
		// Solve the odd Rounds only.
		const { words, podium } = await playMatch(code, socket, (round) => round % 2 === 1);
		expect(socket.received.some((m) => m.type === "room" && m.room.phase === "playing")).toBe(true);
		expect(new Set(words).size).toBe(5);
		const total = socket.received.reduce((sum, m) => (m.type === "guess-result" && m.result === "correct" ? sum + m.points : sum), 0);
		expect(total).toBeGreaterThanOrEqual(150);
		expect(podium).toEqual([{ playerId: guest.id, name: guest.name, points: total, place: 1 }]);
		const over = await socket.next("room", (m) => m.room.phase === "over");
		expect(over.room.podium).toEqual(podium);
		socket.close();
	});

	it("starts one Match when start arrives twice at once", async () => {
		const { socket } = await soloRoom();
		socket.send({ type: "start" });
		socket.send({ type: "start" });
		expect(await socket.next("rejected")).toMatchObject({ reason: "in_progress" });
		expect(socket.received.filter((m) => m.type === "countdown")).toHaveLength(1);
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
