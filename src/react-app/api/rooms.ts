import { http } from "@/lib/http";
import { roomSocketPath, type CreateRoomRequest, type CreateRoomResponse, type ClientMessage, type RoomKind, type ServerMessage } from "../../shared/rooms";

export async function createRoom(kind: RoomKind, token: string): Promise<CreateRoomResponse> {
	const res = await http("/api/rooms", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ kind, token } satisfies CreateRoomRequest),
	});
	return (await res.json()) as CreateRoomResponse;
}

/** `send` says whether the message went: not while the socket is opening or closed. */
export type RoomSocket = { send: (message: ClientMessage) => boolean; close: () => void };

/** Opens the Room's WebSocket and hands every message to `onMessage`; `onClose` gets the close code. Reconnecting is the caller's (useRoom). */
export function openRoomSocket(code: string, token: string, handlers: { onMessage: (message: ServerMessage) => void; onClose: (code: number) => void }): RoomSocket {
	const scheme = location.protocol === "https:" ? "wss" : "ws";
	const socket = new WebSocket(`${scheme}://${location.host}${roomSocketPath(code, token)}`);
	socket.addEventListener("message", (event) => handlers.onMessage(JSON.parse(event.data as string) as ServerMessage));
	socket.addEventListener("close", (event) => handlers.onClose(event.code));
	return {
		// Dropped while the socket isn't open: the Room's next message tells the page where things stand.
		send: (message) => {
			if (socket.readyState !== WebSocket.OPEN) return false;
			socket.send(JSON.stringify(message));
			return true;
		},
		close: () => socket.close(1000),
	};
}
