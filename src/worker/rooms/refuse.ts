import { MAX_PEOPLE_PER_ROOM, ROOM_REFUSED_CLOSE_CODE, type RefusalReason, type RejectionReason, type ServerMessage } from "../../shared/rooms";

const REFUSALS: Record<RefusalReason, string> = {
	bad_identity: "We couldn't tell who you are. Reload the page and try again.",
	not_found: "There is no Room with that code.",
	solo: "This is a Solo Room: only the person who created it can play in it.",
	full: `This Room is full: it holds at most ${MAX_PEOPLE_PER_ROOM} people.`,
	ended: "This Room has ended. Create a new one from the home page.",
};

const REJECTIONS: Record<RejectionReason, string> = {
	not_host: "Only the Host can start the Match.",
	in_progress: "A Match is already under way.",
	no_words: "There aren't enough pictures to play with yet. Please try again later.",
	spectator: "You're watching this Match. You'll play in the next one.",
};

/** Turns down a request on an open socket; the browser stays in the Room. */
export const rejection = (reason: RejectionReason): ServerMessage => ({ type: "rejected", reason, message: REJECTIONS[reason] });

/**
 * Accepts the WebSocket only to say why it is refused, then closes it. A
 * refused upgrade (an HTTP 4xx) reaches the browser as a bare error event with
 * no reason, so the user could never be told what went wrong.
 */
export function refusedSocket(reason: RefusalReason): Response {
	const [client, server] = Object.values(new WebSocketPair());
	server.accept();
	server.send(JSON.stringify({ type: "refused", reason, message: REFUSALS[reason] } satisfies ServerMessage));
	server.close(ROOM_REFUSED_CLOSE_CODE, reason);
	return new Response(null, { status: 101, webSocket: client });
}
