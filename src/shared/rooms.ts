/**
 * Rooms and Guests: the HTTP request/response types and the Room's WebSocket
 * protocol, shared by the Worker and the browser. Vocabulary: GLOSSARY.md.
 */

/** Room codes avoid look-alikes: no 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function isRoomCode(value: string): boolean {
	return value.length === ROOM_CODE_LENGTH && [...value].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

/** Solo: its creator alone. Private: anyone with the code or link. Public joins this union later. */
export const ROOM_KINDS = ["solo", "private"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];
export const isRoomKind = (value: unknown): value is RoomKind => (ROOM_KINDS as readonly unknown[]).includes(value);

/** Everyone in a Room at once, Players and Spectators together (spec #3). */
export const MAX_PEOPLE_PER_ROOM = 10;

/** A Guest as its token carries it: no D1 row (ADR 0001). */
export type Guest = { id: string; name: string };

/** `POST /api/guest`: send the stored token, if any; get it back, or a new one when it is missing or invalid. */
export type GuestRequest = { token?: string };
export type GuestResponse = { token: string; guest: Guest };

/** `POST /api/rooms` */
export type CreateRoomRequest = { kind: RoomKind; token: string };
export type CreateRoomResponse = { code: string; url: string };

/** The browser route of a Room's page. */
export const roomPagePath = (code: string) => `/r/${code}`;

/** The Room's WebSocket: `GET /api/rooms/:code/ws?token=<Guest token>`. */
export const roomSocketPath = (code: string, token: string) => `/api/rooms/${code}/ws?token=${encodeURIComponent(token)}`;

export type RosterEntry = { id: string; name: string; identity: "guest" };

/** Where the Room is in its Match cycle. */
export type RoomPhase = "lobby" | "playing" | "over";

/**
 * `hostId` is the Host's person id. `roster`: everyone in the Room, in the
 * order they arrived, including those whose connection dropped less than
 * `SEAT_HOLD_MS` ago (`awayIds`). `spectatorIds`: the people in the roster
 * who aren't Players of the current Match (they arrived after it started);
 * empty in the Lobby. `scores`: the current or last Match's totals, so a
 * reconnecting browser can redraw them. `podium` is there once the Match is
 * over, so a browser arriving then can show it.
 */
export type RoomSnapshot = {
	code: string;
	kind: RoomKind;
	hostId: string;
	roster: RosterEntry[];
	awayIds: string[];
	spectatorIds: string[];
	phase: RoomPhase;
	scores?: Scores;
	podium?: PodiumEntry[];
};

/** How long a dropped connection keeps its place in the Room: a Player's Seat, or the Host role (spec #3). */
export const SEAT_HOLD_MS = 30_000;

export type RefusalReason = "bad_identity" | "not_found" | "solo" | "full";

/** A Match is exactly this many Rounds (spec #3). */
export const ROUNDS_PER_MATCH = 5;
export const COUNTDOWN_MS = 3_000;
export const ROUND_TIME_MS = 15_000;
export const REVEAL_MS = 5_000;

/**
 * One Blank. Typed slots are filled by the Player; given slots (Hint Letters,
 * separators) arrive with their character and the cursor skips them.
 */
export type Slot = { kind: "typed" } | { kind: "given"; char: string };

/** Points for a correct guess: 50, plus up to 50 for the time left, measured on the server. */
export function roundPoints(timeLeftMs: number, timeLimitMs = ROUND_TIME_MS): number {
	const left = Math.min(Math.max(timeLeftMs, 0), timeLimitMs);
	return 50 + Math.floor((50 * left) / timeLimitMs);
}

/** Points per Player id. */
export type Scores = Record<string, number>;

/** One line of the Podium. */
export type PodiumEntry = { playerId: string; name: string; points: number; place: number };

/**
 * The Podium of a Match: every Player, most points first. Equal points share
 * a place and the places they take are skipped (1, 1, 3). Ties keep the
 * order the Players are given in.
 */
export function podium(players: { id: string; name: string }[], scores: Scores): PodiumEntry[] {
	const sorted = players.map((p) => ({ playerId: p.id, name: p.name, points: scores[p.id] ?? 0 })).sort((x, y) => y.points - x.points);
	return sorted.map((e) => ({ ...e, place: 1 + sorted.filter((o) => o.points > e.points).length }));
}

/** Why the Room turned down something a browser asked for; the socket stays open. */
export type RejectionReason = "not_host" | "in_progress" | "no_words" | "spectator";

/**
 * A Round as its start announces it. Never carries the word. `timeLeftMs` is
 * `timeLimitMs` at the start, less for someone who arrives during the Round.
 */
export type RoundStart = { round: number; rounds: number; pictureUrl: string; timeLimitMs: number; timeLeftMs: number; slots: Slot[] };

/** A Round's end: the word, this Round's points, the totals, and the next picture to load ahead. */
export type RoundEnd = { round: number; word: string; points: Scores; scores: Scores; nextPictureUrl: string | null; ms: number };

/** The Room's answer to a guess, to the guesser only. */
export type GuessResult = "correct" | "near-miss" | "wrong";

/** What a browser sends to its Room. */
export type ClientMessage =
	| { type: "start" }
	| { type: "guess"; guess: string }
	/** Leave Room, confirmed: gives up the Seat (and the Host role) at once, closing every tab of this person. */
	| { type: "leave" };

/** Close code a Room uses after sending a refusal (application range 4000-4999). */
export const ROOM_REFUSED_CLOSE_CODE = 4403;
/** Close code a Room uses for the sockets of someone who chose Leave Room: the browser doesn't reconnect. */
export const ROOM_LEFT_CLOSE_CODE = 4001;

export type ServerMessage =
	| { type: "room"; room: RoomSnapshot }
	| { type: "refused"; reason: RefusalReason; message: string }
	| { type: "rejected"; reason: RejectionReason; message: string }
	/** A Round's countdown has begun; its picture appears after `ms`. */
	| { type: "countdown"; round: number; ms: number }
	| ({ type: "round" } & RoundStart)
	/** To the guesser only. */
	| { type: "guess-result"; result: "correct"; points: number }
	/** `near-miss` (Almost!): one wrong letter, or two neighbouring letters swapped. Never says where. */
	| { type: "guess-result"; result: Exclude<GuessResult, "correct"> }
	/** To everyone: who has solved the current Round, never the word. */
	| { type: "solved"; playerId: string }
	| ({ type: "round-end" } & RoundEnd)
	/** The Match is over: every Player of it, placed. */
	| { type: "podium"; podium: PodiumEntry[] };
