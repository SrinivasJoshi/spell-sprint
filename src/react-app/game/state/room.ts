import type { PodiumEntry, RoomSnapshot, RoundEnd, RoundStart, Scores, ServerMessage } from "../../../shared/rooms";

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
export type GuessAnswer = { n: number; result: "correct" | "wrong"; points?: number };

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
};

/** The browser's view of a Room: the last snapshot the server sent and the messages since, plus how the connection stands. */
export type RoomState =
	| { status: "connecting" }
	| InRoom
	| { status: "refused"; message: string }
	| { status: "disconnected"; room?: RoomSnapshot };

export const initialRoomState: RoomState = { status: "connecting" };

export type RoomEvent = ServerMessage | { type: "closed" };

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
	switch (event.type) {
		case "room":
			return state.status === "in-room" ? { ...state, room: event.room } : { status: "in-room", room: event.room, scores: {}, solved: [] };
		case "refused":
			return { status: "refused", message: event.message };
		case "closed":
			// A refusal is followed by a close; keep the reason on screen.
			if (state.status === "refused") return state;
			return { status: "disconnected", room: state.status === "in-room" ? state.room : undefined };
	}
	if (state.status !== "in-room") return state;
	switch (event.type) {
		case "rejected":
			return { ...state, notice: event.message };
		case "countdown":
			return { ...state, notice: undefined, scores: event.round === 1 ? {} : state.scores, match: { step: "countdown", round: event.round, ms: event.ms } };
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
