import { expect } from "vitest";
import { ROUNDS_PER_MATCH } from "../../../src/shared/rooms";
import { wordFor } from "./catalogue";
import { advanceRoom } from "./clock";
import { createRoom, issueGuest } from "./http";
import { openRoomSocket, type RoomSocket } from "./room-socket";

/** A Guest alone in their Solo Room, before the Match. */
export async function soloRoom() {
	const { token, guest } = await issueGuest();
	const code = await createRoom(token);
	const socket = await openRoomSocket(code, token);
	await socket.next("room");
	return { code, socket, guest };
}

/**
 * Starts a Match in this Room and plays it to the Podium, solving the Rounds
 * `solve` picks. Returns the Words in the order they came, the Podium, and
 * every message the Match brought.
 */
export async function playMatch(code: string, socket: RoomSocket, solve: (round: number) => boolean = () => false) {
	const words: string[] = [];
	const from = socket.received.length;
	const since = () => socket.received.slice(from);
	socket.send({ type: "start" });
	for (let round = 1; round <= ROUNDS_PER_MATCH; round++) {
		await socket.next("countdown", (m) => m.round === round && since().includes(m));
		await advanceRoom(code);
		const r = await socket.next("round", (m) => m.round === round && since().includes(m));
		words.push(wordFor(r.pictureUrl));
		if (solve(round)) {
			socket.send({ type: "guess", guess: words.at(-1) });
			const solvedSoFar = () => since().filter((m) => m.type === "solved").length;
			const expected = solvedSoFar() + 1;
			await socket.next("solved", () => solvedSoFar() === expected);
		}
		await advanceRoom(code);
		const end = await socket.next("round-end", (m) => m.round === round && since().includes(m));
		expect(end.nextPictureUrl === null).toBe(round === ROUNDS_PER_MATCH);
		await advanceRoom(code);
	}
	const podium = await socket.next("podium", (m) => since().includes(m));
	return { words, podium: podium.podium, messages: since() };
}
