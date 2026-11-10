import { useEffect, useReducer } from "react";
import { openRoomSocket } from "@/api/rooms";
import { initialRoomState, roomReducer, type RoomState } from "../state/room";

/** Owns the Room's WebSocket for as long as the component is mounted, and feeds the reducer. */
export function useRoom(code: string, token: string | undefined): RoomState {
	const [state, dispatch] = useReducer(roomReducer, initialRoomState);
	useEffect(() => {
		if (!token) return;
		// A socket this effect closed still fires its close event: ignore it.
		let live = true;
		const socket = openRoomSocket(code, token, {
			onMessage: (message) => live && dispatch(message),
			onClose: () => live && dispatch({ type: "closed" }),
		});
		return () => {
			live = false;
			socket.close();
		};
	}, [code, token]);
	return state;
}
