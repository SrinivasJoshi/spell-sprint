import type { RoomSnapshot, ServerMessage } from "../../../shared/rooms";

/** The browser's view of a Room: the last snapshot the server sent, plus how the connection stands. */
export type RoomState =
	| { status: "connecting" }
	| { status: "in-room"; room: RoomSnapshot }
	| { status: "refused"; message: string }
	| { status: "disconnected"; room?: RoomSnapshot };

export const initialRoomState: RoomState = { status: "connecting" };

export type RoomEvent = ServerMessage | { type: "closed" };

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
	switch (event.type) {
		case "room":
			return { status: "in-room", room: event.room };
		case "refused":
			return { status: "refused", message: event.message };
		case "closed":
			// A refusal is followed by a close; keep the reason on screen.
			if (state.status === "refused") return state;
			return { status: "disconnected", room: state.status === "in-room" ? state.room : undefined };
	}
}
