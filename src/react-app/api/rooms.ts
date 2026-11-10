import { http } from "@/lib/http";
import { roomSocketPath, type CreateRoomRequest, type CreateRoomResponse, type RoomKind, type ServerMessage } from "../../shared/rooms";

export async function createRoom(kind: RoomKind, token: string): Promise<CreateRoomResponse> {
	const res = await http("/api/rooms", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ kind, token } satisfies CreateRoomRequest),
	});
	return (await res.json()) as CreateRoomResponse;
}

export type RoomSocket = { close: () => void };

/** Opens the Room's WebSocket and hands every message to `onMessage`. Reconnecting comes later (spec #3). */
export function openRoomSocket(code: string, token: string, handlers: { onMessage: (message: ServerMessage) => void; onClose: () => void }): RoomSocket {
	const scheme = location.protocol === "https:" ? "wss" : "ws";
	const socket = new WebSocket(`${scheme}://${location.host}${roomSocketPath(code, token)}`);
	socket.addEventListener("message", (event) => handlers.onMessage(JSON.parse(event.data as string) as ServerMessage));
	socket.addEventListener("close", handlers.onClose);
	return { close: () => socket.close(1000) };
}
