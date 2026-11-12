import type { GuessResult, PodiumEntry, RoomSnapshot, RoundEnd, RoundStart, Scores, ServerMessage } from "../../../shared/rooms";

/**
 * Where the Match stands, as far as the screens care: one step per Room
 * phase. Durations are relative (`ms`), so a wrong browser clock can't skew them.
 */
export type MatchView =
	| { step: "countdown"; round: number; ms: number }
	| ({ step: "round" } & RoundStart)
	| ({ step: "reveal" } & Omit<RoundEnd, "scores">)
	| { step: "over"; podium: PodiumEntry[] };

/** The answer to this browser's last guess; `n` counts answers so a hook can react to each one. */
export type GuessAnswer = { n: number; result: GuessResult; points?: number };

export type InRoom = {
	status: "in-room";
	room: RoomSnapshot;
	match?: MatchView;
	/** Match totals per Player id. */
	scores: Scores;
	/** Who has solved the current Round. */
	solved: string[];
	guess?: GuessAnswer;
	/** Why the Room turned down the last request, until the next one. */
	notice?: string;
	/** The connection dropped: what is shown is the last known state until the Room's new snapshot replaces it. */
	reconnecting?: boolean;
};

/** The browser's view of a Room: the last snapshot the server sent and the messages since, plus how the connection stands. */
export type RoomState = { status: "connecting" } | InRoom | { status: "refused"; message: string } | { status: "left" };

export const initialRoomState: RoomState = { status: "connecting" };

/** Besides the Room's messages: the connection dropped and is being reopened, or this person left the Room (from any tab). */
export type RoomEvent = ServerMessage | { type: "reconnecting" } | { type: "left" };

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
	switch (event.type) {
		case "room":
			// The first snapshot, or the first after a reconnect, starts afresh: the Room's catch-up follows it.
			if (state.status !== "in-room" || state.reconnecting) return { status: "in-room", room: event.room, scores: event.room.scores ?? {}, solved: [] };
			return { ...state, room: event.room };
		case "refused":
			return { status: "refused", message: event.message };
		case "reconnecting":
			return state.status === "in-room" ? { ...state, reconnecting: true } : state;
		case "left":
			return { status: "left" };
	}
	if (state.status !== "in-room") return state;
	switch (event.type) {
		case "rejected":
			return { ...state, notice: event.message };
		case "countdown":
			return {
				...state,
				notice: undefined,
				scores: event.round === 1 ? {} : state.scores,
				match: { step: "countdown", round: event.round, ms: event.ms },
			};
		case "round":
			return {
				...state,
				match: { ...event, step: "round" },
				solved: [],
				guess: undefined,
			};
		case "guess-result":
			return { ...state, guess: { n: (state.guess?.n ?? 0) + 1, result: event.result, points: event.result === "correct" ? event.points : undefined } };
		case "solved":
			return { ...state, solved: [...state.solved, event.playerId] };
		case "round-end":
			return {
				...state,
				scores: event.scores,
				match: { step: "reveal", round: event.round, word: event.word, points: event.points, ms: event.ms, nextPictureUrl: event.nextPictureUrl },
			};
		case "podium":
			return { ...state, match: { step: "over", podium: event.podium } };
	}
}

/** The other Players who have solved the current Round, by name, in roster order. */
export function solvedByOthers(state: InRoom, meId?: string): string[] {
	return state.room.roster.filter((p) => p.id !== meId && state.solved.includes(p.id)).map((p) => p.name);
}

/** Watching the current Match, having arrived after it started: shown its Rounds, but no guessing until the next one. */
export const isSpectating = (state: InRoom, meId?: string): boolean => !!meId && state.room.spectatorIds.includes(meId);

/** The Host's display name, from the roster. */
export const hostName = (state: InRoom): string | undefined => state.room.roster.find((p) => p.id === state.room.hostId)?.name;
