import { expect } from "vitest";
import { ROUNDS_PER_MATCH, type GuestResponse } from "../../../src/shared/rooms";
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

/** A Guest's socket in a Room, once it has had the roster. */
export async function joinRoom(code: string, guest: GuestResponse) {
	const socket = await openRoomSocket(code, guest.token);
	await socket.next("room");
	return socket;
}

/** A Private Room with its Host (first) and `others` friends in it, every socket having seen the full roster. Close the sockets after. */
export async function privateRoom(others: number) {
	const host = await issueGuest();
	const code = await createRoom(host.token, { kind: "private" });
	const guests = [host];
	const sockets = [await joinRoom(code, host)];
	for (let i = 0; i < others; i++) {
		const guest = await issueGuest();
		guests.push(guest);
		sockets.push(await joinRoom(code, guest));
	}
	for (const s of sockets) await s.next("room", (m) => m.room.roster.length === guests.length);
	return { code, guests, sockets };
}

/** The Host starts the Match and every socket reaches Round 1: its word. */
export async function toRound1(code: string, sockets: RoomSocket[]) {
	sockets[0].send({ type: "start" });
	for (const s of sockets) await s.next("countdown");
	await advanceRoom(code);
	const rounds = await Promise.all(sockets.map((s) => s.next("round")));
	return wordFor(rounds[0].pictureUrl);
}

/** From the reveal of `round`, plays the rest of the Match out unsolved: the Podium, as `socket` sees it. */
export async function finishMatch(code: string, socket: RoomSocket, round: number) {
	await socket.next("round-end", (m) => m.round === round);
	for (let r = round + 1; r <= ROUNDS_PER_MATCH; r++) {
		await advanceRoom(code);
		await socket.next("countdown", (m) => m.round === r);
		await advanceRoom(code);
		await socket.next("round", (m) => m.round === r);
		await advanceRoom(code);
		await socket.next("round-end", (m) => m.round === r);
	}
	await advanceRoom(code);
	return (await socket.next("podium")).podium;
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
		} else {
			// A solved Round ends at once: its one Player has solved it.
			await advanceRoom(code);
		}
		const end = await socket.next("round-end", (m) => m.round === round && since().includes(m));
		expect(end.nextPictureUrl === null).toBe(round === ROUNDS_PER_MATCH);
		await advanceRoom(code);
	}
	const podium = await socket.next("podium", (m) => since().includes(m));
	return { words, podium: podium.podium, messages: since() };
}
