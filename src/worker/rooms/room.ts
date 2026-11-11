import { DurableObject } from "cloudflare:workers";
import { sql } from "kysely";
import {
	COUNTDOWN_MS,
	REVEAL_MS,
	ROUND_TIME_MS,
	ROUNDS_PER_MATCH,
	podium,
	roundPoints,
	type ClientMessage,
	type RoomKind,
	type RoomPhase,
	type RoomSnapshot,
	type RosterEntry,
	type Scores,
	type ServerMessage,
	type Slot,
} from "../../shared/rooms";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import { refusedSocket, rejection } from "./refuse";

/** What a Room remembers about itself; set once, at creation. */
type RoomRecord = { code: string; kind: RoomKind; creatorId: string };

/** The Words of a Match. The spelling never leaves the Room before its Round ends. */
type MatchWord = { id: string; spelling: string; pictureKey: string; hintPositions?: number[] };

/**
 * The Match in progress, kept in storage so the Room can hibernate between
 * alarms. Each Round goes countdown → round → reveal; after the last reveal
 * the Match is over.
 */
type MatchState = {
	words: MatchWord[];
	/** Who plays this Match, as they were at its start; a Player who leaves keeps their place on the Podium. */
	players: RosterEntry[];
	/** 1-based. */
	round: number;
	step: "countdown" | "round" | "reveal" | "over";
	/** Server time the current Round's picture went up; speed is measured from it. */
	roundStartedAt: number;
	/** Match totals per Player id: the Seats. */
	scores: Scores;
	/** This Round's points per Player who has solved it. */
	solved: Scores;
};

/** Header the Worker uses to tell the Room who is connecting (it verified the identity). */
export const ROOM_IDENTITY_HEADER = "x-room-identity";

const pictureUrl = (key: string) => `/api/pictures/${key}`;

/**
 * A Word's Blanks: one slot per character, the Hint Letters given with their
 * letter. Separators (space, hyphen), once the Catalogue has them, become given slots here too.
 */
function blanksFor(word: MatchWord): Slot[] {
	const hints = new Set(word.hintPositions ?? []);
	return [...word.spelling].map((char, i) => (hints.has(i) ? { kind: "given", char } : { kind: "typed" }));
}

/** One wrong letter, or one swap of neighbouring letters (GLOSSARY.md, Near Miss). Both lowercase. */
function isNearMiss(guess: string, word: string): boolean {
	if (guess.length !== word.length) return false;
	const diff = [...word].flatMap((ch, i) => (ch === guess[i] ? [] : [i]));
	if (diff.length === 1) return true;
	const [a, b] = diff;
	return diff.length === 2 && b === a + 1 && guess[a] === word[b] && guess[b] === word[a];
}

/**
 * One Room (ADR 0002): owns its WebSockets, through the Hibernation API, so an
 * idle Room costs nothing, and runs its Match on alarms. Each socket carries
 * its person as its attachment, and the roster is read from the sockets
 * themselves. Reached only through the Worker (src/worker/routes/rooms.ts),
 * which checks identities first.
 */
export class Room extends DurableObject<AppEnv> {
	private record: RoomRecord | undefined;
	private match: MatchState | undefined;
	/** A start is drawing its Words. D1 is not storage, so the input gate lets another start in meanwhile. */
	private starting = false;

	private async load(): Promise<RoomRecord | undefined> {
		this.record ??= await this.ctx.storage.get<RoomRecord>("room");
		return this.record;
	}

	private async loadMatch(): Promise<MatchState | undefined> {
		this.match ??= await this.ctx.storage.get<MatchState>("match");
		return this.match;
	}

	private async saveMatch(match: MatchState): Promise<void> {
		this.match = match;
		await this.ctx.storage.put("match", match);
	}

	/** Sets the Room up; false when this code is already taken, so a code is never reused. */
	async create(record: RoomRecord): Promise<boolean> {
		if (await this.load()) return false;
		await this.ctx.storage.put("room", record);
		this.record = record;
		return true;
	}

	async fetch(request: Request): Promise<Response> {
		const room = await this.load();
		if (!room) return refusedSocket("not_found");
		const person = JSON.parse(request.headers.get(ROOM_IDENTITY_HEADER) ?? "null") as RosterEntry | null;
		if (!person) return refusedSocket("bad_identity");
		if (room.kind === "solo" && person.id !== room.creatorId) return refusedSocket("solo");

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(person);
		this.broadcast({ type: "room", room: await this.snapshot(room) });
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
		let message: ClientMessage;
		try {
			message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)) as ClientMessage;
		} catch {
			return;
		}
		const person = ws.deserializeAttachment() as RosterEntry;
		if (message.type === "start") await this.start(ws, person);
		else if (message.type === "guess" && typeof message.guess === "string") await this.guess(person, message.guess);
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		try {
			// Complete the close handshake. Not with the browser's code: 1005/1006/1015 can't be sent.
			ws.close(1000);
		} catch {
			// Already closed.
		}
		const room = await this.load();
		if (room) this.broadcast({ type: "room", room: await this.snapshot(room, ws) }, ws);
	}

	/** Moves the Match on: countdown → Round → reveal → next countdown, or the end of the Match. */
	async alarm(): Promise<void> {
		const match = await this.loadMatch();
		if (!match) return;
		if (match.step === "countdown") await this.startRound(match);
		else if (match.step === "round") await this.endRound(match);
		else if (match.step === "reveal") await this.afterReveal(match);
	}

	/** The Host starts a Match, the first or another from the Podium: 5 Words drawn at random, then Round 1's countdown. */
	private async start(ws: WebSocket, person: RosterEntry): Promise<void> {
		const room = await this.load();
		if (!room) return;
		if (person.id !== room.creatorId) return this.send(ws, rejection("not_host"));
		const current = await this.loadMatch();
		if (this.starting || (current && current.step !== "over")) return this.send(ws, rejection("in_progress"));

		this.starting = true;
		let words: MatchWord[] | undefined;
		try {
			words = await this.drawWords();
		} finally {
			this.starting = false;
		}
		if (!words) return this.send(ws, rejection("no_words"));

		const players = this.people();
		const scores: Scores = {};
		for (const p of players) scores[p.id] = 0;
		const match: MatchState = {
			words,
			players,
			round: 1,
			step: "countdown",
			roundStartedAt: 0,
			scores,
			solved: {},
		};
		await this.saveMatch(match);
		this.broadcast({ type: "room", room: await this.snapshot(room) });
		await this.countdown(match);
	}

	/**
	 * A Match's Words, at random among those this Room hasn't used yet. When
	 * fewer are left than a Match needs, it takes them all and the Catalogue
	 * starts over for the rest. Undefined when the Catalogue is too small.
	 */
	private async drawWords(): Promise<MatchWord[] | undefined> {
		const used = (await this.ctx.storage.get<string[]>("used-words")) ?? [];
		const fresh = await this.randomWords(used, ROUNDS_PER_MATCH);
		let words = fresh;
		let usedNow = [...used, ...fresh.map((w) => w.id)];
		if (fresh.length < ROUNDS_PER_MATCH) {
			const refill = await this.randomWords(fresh.map((w) => w.id), ROUNDS_PER_MATCH - fresh.length);
			words = [...fresh, ...refill];
			// The new round of the Catalogue starts with this whole Match, so none of its Words comes straight back.
			usedNow = words.map((w) => w.id);
		}
		if (words.length < ROUNDS_PER_MATCH) return undefined;
		await this.ctx.storage.put("used-words", usedNow);
		return words;
	}

	private async randomWords(excluding: string[], count: number): Promise<MatchWord[]> {
		const rows = await createDb(this.env)
			.selectFrom("words")
			.select(["id", "spelling", "picture_key", "hint_positions"])
			// One parameter however many are excluded: D1 allows only 100 per statement.
			.where(sql<boolean>`id not in (select value from json_each(${JSON.stringify(excluding)}))`)
			.orderBy(sql`random()`)
			.limit(count)
			.execute();
		return rows.map((r) => ({
			id: r.id,
			spelling: r.spelling,
			pictureKey: r.picture_key,
			hintPositions: r.hint_positions ? (JSON.parse(r.hint_positions) as number[]) : undefined,
		}));
	}

	private async countdown(match: MatchState): Promise<void> {
		this.broadcast({ type: "countdown", round: match.round, ms: COUNTDOWN_MS });
		await this.ctx.storage.setAlarm(Date.now() + COUNTDOWN_MS);
	}

	private async startRound(match: MatchState): Promise<void> {
		const word = match.words[match.round - 1];
		const next: MatchState = { ...match, step: "round", roundStartedAt: Date.now(), solved: {} };
		await this.saveMatch(next);
		this.broadcast({
			type: "round",
			round: next.round,
			rounds: next.words.length,
			pictureUrl: pictureUrl(word.pictureKey),
			timeLimitMs: ROUND_TIME_MS,
			slots: blanksFor(word),
		});
		await this.ctx.storage.setAlarm(next.roundStartedAt + ROUND_TIME_MS);
	}

	/**
	 * Compares a guess with the word, ignoring case. Right: points from the time
	 * left on the server's clock, input locked, everyone told who solved it.
	 * Wrong: only the guesser is told, as a Near Miss when it is one letter off;
	 * no penalty, no limit on attempts.
	 */
	private async guess(person: RosterEntry, guess: string): Promise<void> {
		const match = await this.loadMatch();
		if (!match || match.step !== "round" || !(person.id in match.scores) || person.id in match.solved) return;
		const elapsed = Date.now() - match.roundStartedAt;
		// Time is up but the alarm hasn't run yet: end the Round now, so the guesser isn't left waiting.
		if (elapsed >= ROUND_TIME_MS) return this.endRound(match);

		const word = match.words[match.round - 1];
		const attempt = guess.trim().toLowerCase();
		const spelling = word.spelling.toLowerCase();
		if (attempt !== spelling) {
			return this.sendTo(person.id, { type: "guess-result", result: isNearMiss(attempt, spelling) ? "near-miss" : "wrong" });
		}
		const points = roundPoints(ROUND_TIME_MS - elapsed);
		await this.saveMatch({
			...match,
			solved: { ...match.solved, [person.id]: points },
			scores: { ...match.scores, [person.id]: match.scores[person.id] + points },
		});
		this.sendTo(person.id, { type: "guess-result", result: "correct", points });
		this.broadcast({ type: "solved", playerId: person.id });
	}

	/** Reveals the word and the points, and sends the next picture so browsers can load it during the reveal. */
	private async endRound(match: MatchState): Promise<void> {
		const next: MatchState = { ...match, step: "reveal" };
		await this.saveMatch(next);
		const points: Scores = {};
		for (const id of Object.keys(match.scores)) points[id] = match.solved[id] ?? 0;
		const following = match.words[match.round];
		this.broadcast({
			type: "round-end",
			round: match.round,
			word: match.words[match.round - 1].spelling,
			points,
			scores: match.scores,
			nextPictureUrl: following ? pictureUrl(following.pictureKey) : null,
			ms: REVEAL_MS,
		});
		await this.ctx.storage.setAlarm(Date.now() + REVEAL_MS);
	}

	private async afterReveal(match: MatchState): Promise<void> {
		if (match.round < match.words.length) {
			const next: MatchState = { ...match, step: "countdown", round: match.round + 1 };
			await this.saveMatch(next);
			return this.countdown(next);
		}
		await this.saveMatch({ ...match, step: "over" });
		this.broadcast({ type: "podium", podium: podium(match.players, match.scores) });
		const room = await this.load();
		if (room) this.broadcast({ type: "room", room: await this.snapshot(room) });
	}

	private async phase(): Promise<RoomPhase> {
		const match = await this.loadMatch();
		return !match ? "lobby" : match.step === "over" ? "over" : "playing";
	}

	/** Everyone connected, once each (a person may have several tabs open). */
	private people(leaving?: WebSocket): RosterEntry[] {
		const roster = new Map<string, RosterEntry>();
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === leaving) continue;
			const person = ws.deserializeAttachment() as RosterEntry;
			if (!roster.has(person.id)) roster.set(person.id, person);
		}
		return [...roster.values()];
	}

	private async snapshot(room: RoomRecord, leaving?: WebSocket): Promise<RoomSnapshot> {
		const match = await this.loadMatch();
		const snapshot: RoomSnapshot = { code: room.code, kind: room.kind, roster: this.people(leaving), phase: await this.phase() };
		if (match?.step === "over") snapshot.podium = podium(match.players, match.scores);
		return snapshot;
	}

	private send(ws: WebSocket, message: ServerMessage): void {
		try {
			ws.send(JSON.stringify(message));
		} catch {
			// Closing already.
		}
	}

	/** To every socket of one person: all their tabs. */
	private sendTo(personId: string, message: ServerMessage): void {
		for (const ws of this.ctx.getWebSockets()) {
			if ((ws.deserializeAttachment() as RosterEntry).id === personId) this.send(ws, message);
		}
	}

	private broadcast(message: ServerMessage, leaving?: WebSocket): void {
		for (const ws of this.ctx.getWebSockets()) {
			if (ws !== leaving) this.send(ws, message);
		}
	}
}
