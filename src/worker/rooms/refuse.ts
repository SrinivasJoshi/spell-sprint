import { ROOM_REFUSED_CLOSE_CODE, type RefusalReason, type ServerMessage } from "../../shared/rooms";

const MESSAGES: Record<RefusalReason, string> = {
	bad_identity: "We couldn't tell who you are. Reload the page and try again.",
	not_found: "There is no Room with that code.",
	solo: "This is a Solo Room: only the person who created it can play in it.",
};

/**
 * Accepts the WebSocket only to say why it is refused, then closes it. A
 * refused upgrade (an HTTP 4xx) reaches the browser as a bare error event with
 * no reason, so the user could never be told what went wrong.
 */
export function refusedSocket(reason: RefusalReason): Response {
	const [client, server] = Object.values(new WebSocketPair());
	server.accept();
	server.send(JSON.stringify({ type: "refused", reason, message: MESSAGES[reason] } satisfies ServerMessage));
	server.close(ROOM_REFUSED_CLOSE_CODE, reason);
	return new Response(null, { status: 101, webSocket: client });
}
