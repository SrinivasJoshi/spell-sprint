import { useCallback, useEffect, useReducer, useRef } from "react";
import { openRoomSocket, type RoomSocket } from "@/api/rooms";
import { ROOM_LEFT_CLOSE_CODE, ROOM_REFUSED_CLOSE_CODE } from "../../../shared/rooms";
import { initialRoomState, roomReducer, type RoomState } from "../state/room";

/** Waits between attempts to reopen a dropped socket: quick at first (a blip), then every few seconds. */
const RETRY_MS = [500, 1_000, 2_000, 4_000];

export type UseRoom = {
	state: RoomState;
	/** The Host starts the Match. */
	start: () => void;
	/** Sends a filled-in guess; the answer arrives as `state.guess`. */
	guess: (guess: string) => void;
	/** Leave Room, once confirmed: gives up the Seat at once. */
	leave: () => void;
};

/**
 * Owns the Room's WebSocket for as long as the component is mounted, feeds
 * the reducer and sends the Player's intents. A dropped socket is reopened
 * with the same identity until it is back (the Room holds the Seat for
 * SEAT_HOLD_MS); not after a refusal or Leave Room.
 */
export function useRoom(code: string, token: string | undefined): UseRoom {
	const [state, dispatch] = useReducer(roomReducer, initialRoomState);
	const socket = useRef<RoomSocket | null>(null);
	useEffect(() => {
		if (!token) return;
		// A socket this effect closed still fires its close event: ignore it.
		let live = true;
		let attempts = 0;
		let retry: ReturnType<typeof setTimeout> | undefined;
		const connect = () => {
			let refused = false;
			socket.current = openRoomSocket(code, token, {
				onMessage: (message) => {
					if (!live) return;
					attempts = 0;
					if (message.type === "refused") refused = true;
					dispatch(message);
				},
				onClose: (closeCode) => {
					if (!live || refused || closeCode === ROOM_REFUSED_CLOSE_CODE) return;
					if (closeCode === ROOM_LEFT_CLOSE_CODE) return dispatch({ type: "left" });
					dispatch({ type: "reconnecting" });
					retry = setTimeout(connect, RETRY_MS[Math.min(attempts++, RETRY_MS.length - 1)]);
				},
			});
		};
		connect();
		return () => {
			live = false;
			clearTimeout(retry);
			socket.current?.close();
			socket.current = null;
		};
	}, [code, token]);
	const start = useCallback(() => void socket.current?.send({ type: "start" }), []);
	const guess = useCallback((value: string) => void socket.current?.send({ type: "guess", guess: value }), []);
	const leave = useCallback(() => {
		if (socket.current?.send({ type: "leave" }) || !token) return;
		// Not connected just now (reconnecting): a socket of its own, opened only to leave, so the
		// Seat and the Host role still go at once. It outlives the page; the Room closes it.
		const once = openRoomSocket(code, token, { onMessage: (m) => m.type === "room" && once.send({ type: "leave" }), onClose: () => {} });
	}, [code, token]);
	return { state, start, guess, leave };
}
