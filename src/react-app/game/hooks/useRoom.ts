import { useCallback, useEffect, useReducer, useRef } from "react";
import { openRoomSocket, type RoomSocket } from "@/api/rooms";
import { initialRoomState, roomReducer, type RoomState } from "../state/room";

export type UseRoom = {
	state: RoomState;
	/** The Host starts the Match. */
	start: () => void;
	/** Sends a filled-in guess; the answer arrives as `state.guess`. */
	guess: (guess: string) => void;
};

/** Owns the Room's WebSocket for as long as the component is mounted, feeds the reducer and sends the Player's intents. */
export function useRoom(code: string, token: string | undefined): UseRoom {
	const [state, dispatch] = useReducer(roomReducer, initialRoomState);
	const socket = useRef<RoomSocket | null>(null);
	useEffect(() => {
		if (!token) return;
		// A socket this effect closed still fires its close event: ignore it.
		let live = true;
		const opened = openRoomSocket(code, token, {
			onMessage: (message) => live && dispatch(message),
			onClose: () => live && dispatch({ type: "closed" }),
		});
		socket.current = opened;
		return () => {
			live = false;
			socket.current = null;
			opened.close();
		};
	}, [code, token]);
	const start = useCallback(() => socket.current?.send({ type: "start" }), []);
	const guess = useCallback((value: string) => socket.current?.send({ type: "guess", guess: value }), []);
	return { state, start, guess };
}
