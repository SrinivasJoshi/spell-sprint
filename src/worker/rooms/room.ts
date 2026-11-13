import { DurableObject } from "cloudflare:workers";
import { sql } from "kysely";
import {
	COUNTDOWN_MS,
	MAX_PEOPLE_PER_ROOM,
	REVEAL_MS,
	ROUND_TIME_MS,
	ROOM_LEFT_CLOSE_CODE,
	ROUNDS_PER_MATCH,
	SEAT_HOLD_MS,
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
import { decodeHintPositions } from "../db/hint-positions";
import type { AppEnv } from "../types/env";
import { refusedSocket, rejection } from "./refuse";

/** What a Room remembers about itself; set once, at creation. Its creator is the first Host. */
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
	/** Server time the current step (countdown, Round, reveal) ends. */
	dueAt: number;
	/** Players whose Seat is gone (they left, or were away too long): still on the Podium, no longer playing. */
	gone: string[];
	/** Match totals per Player id: the Seats. */
	scores: Scores;
	/** This Round's points per Player who has solved it. */
	solved: Scores;
};

/** A Player of this Match: there when it started. Anyone else in the Room is a Spectator until the next one. */
const isPlayer = (match: MatchState, personId: string) => personId in match.scores && !match.gone.includes(personId);

/**
 * Someone in the Room, in the order they arrived. `droppedAt`: when their last
 * socket closed; they keep their place (a Player's Seat) until `SEAT_HOLD_MS` after it.
 */
type Presence = { person: RosterEntry; arrivedAt: number; droppedAt?: number };

/** What each socket carries: its person. */
type Attachment = { person: RosterEntry };
const personOf = (ws: WebSocket) => (ws.deserializeAttachment() as Attachment).person;

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
 * idle Room costs nothing, and runs its Match and its held Seats on one alarm.
 * Each socket carries its person as its attachment; who is in the Room (the
 * roster, with those briefly away) is kept in storage as `presence`. Reached
 * only through the Worker (src/worker/routes/rooms.ts), which checks identities first.
 */
export class Room extends DurableObject<AppEnv> {
	private record: RoomRecord | undefined;
	private match: MatchState | undefined;
	private presence: Presence[] | undefined;
	private ended: boolean | undefined;
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

	/** Ended for good (end()): its code answers "ended" and nothing more happens in it. */
	private async isEnded(): Promise<boolean> {
		this.ended ??= (await this.ctx.storage.get<boolean>("ended")) ?? false;
		return this.ended;
	}

	private async loadPresence(): Promise<Presence[]> {
		if (this.presence) return this.presence;
		const stored = (await this.ctx.storage.get<Presence[]>("presence")) ?? [];
		// A new instance (a deploy or an eviction, not a wake from hibernation) has lost its sockets
		// without a close event: whoever has none left is away from now, so their Seat isn't held forever.
		const now = Date.now();
		const lost = stored.some((p) => p.droppedAt === undefined && this.socketsOf(p.person.id).length === 0);
		this.presence = stored.map((p) => (p.droppedAt === undefined && this.socketsOf(p.person.id).length === 0 ? { ...p, droppedAt: now } : p));
		if (lost) {
			await this.ctx.storage.put("presence", this.presence);
			await this.schedule();
		}
		return this.presence;
	}

	/** Saves who is in the Room, and keeps the Host role with one of them (handOff). */
	private async savePresence(presence: Presence[]): Promise<void> {
		this.presence = presence;
		await this.ctx.storage.put("presence", presence);
		await this.handOff();
	}

	/** The Host's person id: the creator until the role first passes on. */
	private async host(): Promise<string> {
		return (await this.ctx.storage.get<string>("host")) ?? (await this.load())!.creatorId;
	}

	/**
	 * Keeps the Host role with someone in the Room. When the Host is gone (left,
	 * or away past SEAT_HOLD_MS) it passes to whoever has been here longest,
	 * preferring someone connected. (A Room nobody is left in has ended.)
	 */
	private async handOff(): Promise<void> {
		const presence = this.presence ?? [];
		const host = await this.host();
		if (presence.some((p) => p.person.id === host)) return;
		const next = presence.find((p) => p.droppedAt === undefined) ?? presence[0];
		if (next) await this.ctx.storage.put("host", next.person.id);
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
		if (await this.isEnded()) return refusedSocket("ended");
		const person = JSON.parse(request.headers.get(ROOM_IDENTITY_HEADER) ?? "null") as RosterEntry | null;
		if (!person) return refusedSocket("bad_identity");
		if (room.kind === "solo" && person.id !== room.creatorId) return refusedSocket("solo");
		const presence = await this.loadPresence();
		// Someone already here (another tab, or back within SEAT_HOLD_MS) keeps their place.
		const here = presence.find((p) => p.person.id === person.id);
		if (!here && presence.length >= MAX_PEOPLE_PER_ROOM) return refusedSocket("full");

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ person } satisfies Attachment);
		await this.savePresence(
			here ? presence.map((p) => (p === here ? { person, arrivedAt: here.arrivedAt } : p)) : [...presence, { person, arrivedAt: Date.now() }],
		);
		// Back in time: their Seat's hold is over.
		if (here?.droppedAt !== undefined) await this.schedule();
		this.broadcast({ type: "room", room: await this.snapshot(room) });
		await this.catchUp(server, person.id);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
		let message: ClientMessage;
		try {
			message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)) as ClientMessage;
		} catch {
			return;
		}
		const person = personOf(ws);
		// Left already, from another tab: this one is closing.
		if (!(await this.loadPresence()).some((p) => p.person.id === person.id)) return;
		if (message.type === "start") await this.start(ws, person);
		else if (message.type === "guess" && typeof message.guess === "string") await this.guess(person, message.guess);
		else if (message.type === "leave") await this.leave(person);
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		try {
			// Complete the close handshake. Not with the browser's code: 1005/1006/1015 can't be sent.
			ws.close(1000);
		} catch {
			// Already closed.
		}
		// The Room ended with this person's leaving: nothing left to update.
		if (await this.isEnded()) return;
		// Their last tab gone: the Seat is held for SEAT_HOLD_MS.
		const { id } = personOf(ws);
		if (this.socketsOf(id, ws).length === 0) {
			const presence = await this.loadPresence();
			await this.savePresence(presence.map((p) => (p.person.id === id ? { ...p, droppedAt: Date.now() } : p)));
			await this.schedule();
		}
		const room = await this.load();
		if (room) this.broadcast({ type: "room", room: await this.snapshot(room) }, ws);
		await this.endIfAllSolved();
	}

	/**
	 * The Room's one alarm serves every deadline: the Match's next step and the
	 * end of each held Seat. It handles the earliest, and anything else due by
	 * now. (A test may run it ahead of time: it then does what it was set for.)
	 */
	async alarm(): Promise<void> {
		const now = Math.max(Date.now(), (await this.nextDeadline()) ?? 0);
		await this.releaseSeats(now);
		const match = await this.loadMatch();
		if (match && match.step !== "over" && match.dueAt <= now) {
			// Moves the Match on: countdown → Round → reveal → next countdown, or the end of the Match.
			if (match.step === "countdown") await this.startRound(match);
			else if (match.step === "round") await this.endRound(match);
			else await this.afterReveal(match);
		}
		await this.schedule();
	}

	private async nextDeadline(): Promise<number | undefined> {
		const match = await this.loadMatch();
		const deadlines = (await this.loadPresence()).flatMap((p) => (p.droppedAt === undefined ? [] : [p.droppedAt + SEAT_HOLD_MS]));
		if (match && match.step !== "over") deadlines.push(match.dueAt);
		return deadlines.length ? Math.min(...deadlines) : undefined;
	}

	/** Sets the alarm for the next deadline, if any. Call after any change to one. */
	private async schedule(): Promise<void> {
		const next = await this.nextDeadline();
		if (next === undefined) await this.ctx.storage.deleteAlarm();
		else await this.ctx.storage.setAlarm(next);
	}

	/** Away for SEAT_HOLD_MS by `now`: off the roster, and out of the Match if they were playing (their points stay on its Podium). */
	private async releaseSeats(now: number): Promise<void> {
		const presence = await this.loadPresence();
		const expired = presence.filter((p) => p.droppedAt !== undefined && p.droppedAt + SEAT_HOLD_MS <= now).map((p) => p.person.id);
		if (!expired.length) return;
		await this.giveUp(expired);
	}

	/**
	 * These people give up their place in the Room: off the roster, and their
	 * Seat in the Match is gone. The last one out ends the Room, so none is left
	 * empty. A Match with no Seat left but Spectators still here is abandoned:
	 * they get the Lobby, one of them Host.
	 */
	private async giveUp(ids: string[]): Promise<void> {
		const remaining = (await this.loadPresence()).filter((p) => !ids.includes(p.person.id));
		if (remaining.length === 0) return this.end();
		await this.savePresence(remaining);
		const match = await this.loadMatch();
		if (match) {
			const gone = [...match.gone, ...ids.filter((id) => id in match.scores && !match.gone.includes(id))];
			if (match.step !== "over" && Object.keys(match.scores).every((id) => gone.includes(id))) {
				this.match = undefined;
				await this.ctx.storage.delete("match");
				await this.schedule();
			} else await this.saveMatch({ ...match, gone });
		}
		const room = await this.load();
		if (room) this.broadcast({ type: "room", room: await this.snapshot(room) });
		await this.endIfAllSolved();
	}

	/** Leave Room: the Seat and the Host role go at once, and every tab of theirs is closed. */
	private async leave(person: RosterEntry): Promise<void> {
		const tabs = this.socketsOf(person.id);
		await this.giveUp([person.id]);
		for (const ws of tabs) {
			try {
				ws.close(ROOM_LEFT_CLOSE_CODE, "left");
			} catch {
				// Closed already.
			}
		}
	}

	/** Nobody is left: the Room ends for good, and its code answers "ended" from now on (codes are never reused). */
	private async end(): Promise<void> {
		const room = await this.load();
		this.match = undefined;
		this.presence = [];
		this.ended = true;
		// Everything but the record and the mark goes, whatever keys the Room has gathered.
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
		await this.ctx.storage.put({ room, ended: true });
	}

	/** The Host starts a Match, the first or another from the Podium: 5 Words drawn at random, then Round 1's countdown. */
	private async start(ws: WebSocket, person: RosterEntry): Promise<void> {
		const room = await this.load();
		if (!room) return;
		if (person.id !== (await this.host())) return this.send(ws, rejection("not_host"));
		const current = await this.loadMatch();
		if (this.starting || (current && current.step !== "over")) return this.send(ws, rejection("in_progress"));

		this.starting = true;
		let words: MatchWord[] | undefined;
		try {
			words = await this.drawWords();
		} finally {
			this.starting = false;
		}
		// Drawing reads D1, which lets other messages in: the starter may have left, or the Room ended, meanwhile.
		if ((await this.isEnded()) || !(await this.loadPresence()).some((p) => p.person.id === person.id)) return;
		if (!words) return this.send(ws, rejection("no_words"));

		const players = (await this.loadPresence()).map((p) => p.person);
		const scores: Scores = {};
		for (const p of players) scores[p.id] = 0;
		const match: MatchState = {
			words,
			players,
			round: 1,
			step: "countdown",
			roundStartedAt: 0,
			dueAt: 0,
			gone: [],
			scores,
			solved: {},
		};
		await this.saveMatch(match);
		this.broadcast({ type: "room", room: await this.snapshot(room) });
		await this.countdown(match, 1);
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
			hintPositions: decodeHintPositions(r.hint_positions),
		}));
	}

	/**
	 * Brings a socket that arrives mid-Match to where the Match stands, with the
	 * messages everyone else had: the countdown, the Round with the time it has
	 * left and who has solved it, or the reveal. The Podium is in the snapshot.
	 */
	private async catchUp(ws: WebSocket, personId: string): Promise<void> {
		const match = await this.loadMatch();
		if (!match || match.step === "over") return;
		const now = Date.now();
		const left = Math.max(match.dueAt - now, 0);
		if (match.step === "countdown") return this.send(ws, { type: "countdown", round: match.round, ms: left });
		if (match.step === "reveal") return this.send(ws, this.roundEndMessage(match, left));
		this.send(ws, this.roundStartMessage(match, now));
		for (const playerId of Object.keys(match.solved)) this.send(ws, { type: "solved", playerId });
		// Back after solving it (a reload or a dropped connection): their input stays locked.
		if (isPlayer(match, personId) && personId in match.solved) this.send(ws, { type: "guess-result", result: "correct", points: match.solved[personId] });
	}

	/** Round `round`'s countdown: saves the Match at that step and tells everyone. */
	private async countdown(match: MatchState, round: number): Promise<void> {
		await this.saveMatch({ ...match, step: "countdown", round, dueAt: Date.now() + COUNTDOWN_MS });
		this.broadcast({ type: "countdown", round, ms: COUNTDOWN_MS });
		await this.schedule();
	}

	private async startRound(match: MatchState): Promise<void> {
		const now = Date.now();
		const next: MatchState = { ...match, step: "round", roundStartedAt: now, dueAt: now + ROUND_TIME_MS, solved: {} };
		await this.saveMatch(next);
		this.broadcast(this.roundStartMessage(next, now));
		await this.schedule();
	}

	/** The current Round's start, as seen at `now`. */
	private roundStartMessage(match: MatchState, now: number): Extract<ServerMessage, { type: "round" }> {
		const word = match.words[match.round - 1];
		return {
			type: "round",
			round: match.round,
			rounds: match.words.length,
			pictureUrl: pictureUrl(word.pictureKey),
			timeLimitMs: ROUND_TIME_MS,
			timeLeftMs: Math.max(match.roundStartedAt + ROUND_TIME_MS - now, 0),
			slots: blanksFor(word),
		};
	}

	/**
	 * Compares a guess with the word, ignoring case. Right: points from the time
	 * left on the server's clock, input locked, everyone told who solved it.
	 * Wrong: only the guesser is told, as a Near Miss when it is one letter off;
	 * no penalty, no limit on attempts.
	 */
	private async guess(person: RosterEntry, guess: string): Promise<void> {
		const match = await this.loadMatch();
		if (!match || match.step !== "round") return;
		if (!isPlayer(match, person.id)) return this.sendTo(person.id, rejection("spectator"));
		// Solved already, in another tab or before a reload (which shows the Round afresh): answer again, so it isn't left waiting.
		if (person.id in match.solved) return this.sendTo(person.id, { type: "guess-result", result: "correct", points: match.solved[person.id] });
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
		await this.endIfAllSolved();
	}

	/**
	 * Ends the Round early once every Player still connected has solved it: no
	 * need to wait out the timer. Players whose connection dropped don't count;
	 * with nobody connected the timer runs on, so a blip doesn't cost the Round.
	 */
	private async endIfAllSolved(): Promise<void> {
		const match = await this.loadMatch();
		if (match?.step !== "round") return;
		const waitingFor = await this.connectedPlayers(match);
		if (waitingFor.length > 0 && waitingFor.every((id) => id in match.solved)) await this.endRound(match);
	}

	/** Reveals the word and the points, and sends the next picture so browsers can load it during the reveal. */
	private async endRound(match: MatchState): Promise<void> {
		const next: MatchState = { ...match, step: "reveal", dueAt: Date.now() + REVEAL_MS };
		await this.saveMatch(next);
		this.broadcast(this.roundEndMessage(next, REVEAL_MS));
		await this.schedule();
	}

	/** The current Round's end, with `ms` of the reveal left. */
	private roundEndMessage(match: MatchState, ms: number): Extract<ServerMessage, { type: "round-end" }> {
		const points: Scores = {};
		for (const id of Object.keys(match.scores)) points[id] = match.solved[id] ?? 0;
		const following = match.words[match.round];
		return {
			type: "round-end",
			round: match.round,
			word: match.words[match.round - 1].spelling,
			points,
			scores: match.scores,
			nextPictureUrl: following ? pictureUrl(following.pictureKey) : null,
			ms,
		};
	}

	private async afterReveal(match: MatchState): Promise<void> {
		if (match.round < match.words.length) return this.countdown(match, match.round + 1);
		await this.saveMatch({ ...match, step: "over" });
		this.broadcast({ type: "podium", podium: podium(match.players, match.scores) });
		const room = await this.load();
		if (room) this.broadcast({ type: "room", room: await this.snapshot(room) });
	}

	private async phase(): Promise<RoomPhase> {
		const match = await this.loadMatch();
		return !match ? "lobby" : match.step === "over" ? "over" : "playing";
	}

	/** A person's open sockets (their tabs), less one that is closing. */
	private socketsOf(personId: string, leaving?: WebSocket): WebSocket[] {
		return this.ctx.getWebSockets().filter((ws) => ws !== leaving && personOf(ws).id === personId);
	}

	/** This Match's Players whose connection is up: the ones a Round waits for. */
	private async connectedPlayers(match: MatchState): Promise<string[]> {
		return (await this.loadPresence()).filter((p) => p.droppedAt === undefined && isPlayer(match, p.person.id)).map((p) => p.person.id);
	}

	private async snapshot(room: RoomRecord): Promise<RoomSnapshot> {
		const match = await this.loadMatch();
		const presence = await this.loadPresence();
		const roster = presence.map((p) => p.person);
		const snapshot: RoomSnapshot = {
			code: room.code,
			kind: room.kind,
			hostId: await this.host(),
			roster,
			awayIds: presence.filter((p) => p.droppedAt !== undefined).map((p) => p.person.id),
			// Not in this Match's scores: arrived after it started. A new Match takes them all (start()).
			spectatorIds: match ? roster.filter((p) => !isPlayer(match, p.id)).map((p) => p.id) : [],
			phase: await this.phase(),
		};
		if (match) snapshot.scores = match.scores;
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
			if (personOf(ws).id === personId) this.send(ws, message);
		}
	}

	private broadcast(message: ServerMessage, leaving?: WebSocket): void {
		for (const ws of this.ctx.getWebSockets()) {
			if (ws !== leaving) this.send(ws, message);
		}
	}
}
