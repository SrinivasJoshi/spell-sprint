import { DurableObject } from "cloudflare:workers";
import { sql } from "kysely";
import {
	COUNTDOWN_MS,
	REVEAL_MS,
	ROUND_TIME_MS,
	ROUNDS_PER_MATCH,
	roundPoints,
	type ClientMessage,
	type RoomKind,
	type RoomPhase,
	type RoomSnapshot,
	type RosterEntry,
	type Scores,
	type ServerMessage,
} from "../../shared/rooms";
import { createDb } from "../db";
import type { AppEnv } from "../types/env";
import { refusedSocket, rejection } from "./refuse";

/** What a Room remembers about itself; set once, at creation. */
type RoomRecord = { code: string; kind: RoomKind; creatorId: string };

/** The Words of a Match. The spelling never leaves the Room before its Round ends. */
type MatchWord = { spelling: string; pictureKey: string };

/**
 * The Match in progress, kept in storage so the Room can hibernate between
 * alarms. Each Round goes countdown → round → reveal; after the last reveal
 * the Match is over.
 */
type MatchState = {
	words: MatchWord[];
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
 * One Room (ADR 0002): owns its WebSockets, through the Hibernation API, so an
 * idle Room costs nothing, and runs its Match on alarms. Each socket carries
 * its person as its attachment, and the roster is read from the sockets
 * themselves. Reached only through the Worker (src/worker/routes/rooms.ts),
 * which checks identities first.
 */
export class Room extends DurableObject<AppEnv> {
	private record: RoomRecord | undefined;
	private match: MatchState | undefined;

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

	/** The Host starts a Match: 5 Words drawn at random, then Round 1's countdown. */
	private async start(ws: WebSocket, person: RosterEntry): Promise<void> {
		const room = await this.load();
		if (!room) return;
		if (person.id !== room.creatorId) return this.send(ws, rejection("not_host"));
		if (await this.loadMatch()) return this.send(ws, rejection("in_progress"));

		const rows = await createDb(this.env)
			.selectFrom("words")
			.select(["spelling", "picture_key"])
			.orderBy(sql`random()`)
			.limit(ROUNDS_PER_MATCH)
			.execute();
		if (rows.length < ROUNDS_PER_MATCH) return this.send(ws, rejection("no_words"));

		const scores: Scores = {};
		for (const p of this.people()) scores[p.id] = 0;
		const match: MatchState = {
			words: rows.map((r) => ({ spelling: r.spelling, pictureKey: r.picture_key })),
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
			// v1: every slot is typed. Hint Letters come as given slots later.
			slots: [...word.spelling].map(() => ({ kind: "typed" })),
		});
		await this.ctx.storage.setAlarm(next.roundStartedAt + ROUND_TIME_MS);
	}

	/**
	 * Compares a guess with the word, ignoring case. Right: points from the time
	 * left on the server's clock, input locked, everyone told who solved it.
	 * Wrong: only the guesser is told; no penalty, no limit on attempts.
	 */
	private async guess(person: RosterEntry, guess: string): Promise<void> {
		const match = await this.loadMatch();
		if (!match || match.step !== "round" || !(person.id in match.scores) || person.id in match.solved) return;
		const elapsed = Date.now() - match.roundStartedAt;
		// Time is up but the alarm hasn't run yet: end the Round now, so the guesser isn't left waiting.
		if (elapsed >= ROUND_TIME_MS) return this.endRound(match);

		const word = match.words[match.round - 1];
		if (guess.trim().toLowerCase() !== word.spelling.toLowerCase()) {
			return this.sendTo(person.id, { type: "guess-result", result: "wrong" });
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
		this.broadcast({ type: "match-over", scores: match.scores });
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
		return { code: room.code, kind: room.kind, roster: this.people(leaving), phase: await this.phase() };
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
