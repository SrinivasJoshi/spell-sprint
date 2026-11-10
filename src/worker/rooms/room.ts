import { DurableObject } from "cloudflare:workers";
import type { RoomKind, RoomSnapshot, RosterEntry, ServerMessage } from "../../shared/rooms";
import type { AppEnv } from "../types/env";
import { refusedSocket } from "./refuse";

/** What a Room remembers about itself; set once, at creation. */
type RoomRecord = { code: string; kind: RoomKind; creatorId: string };

/** Header the Worker uses to tell the Room who is connecting (it verified the identity). */
export const ROOM_IDENTITY_HEADER = "x-room-identity";

/**
 * One Room (ADR 0002): owns its WebSockets, through the Hibernation API, so an
 * idle Room costs nothing. Each socket carries its person as its attachment,
 * and the roster is read from the sockets themselves. Reached only through
 * the Worker (src/worker/routes/rooms.ts), which checks identities first.
 */
export class Room extends DurableObject<AppEnv> {
	private record: RoomRecord | undefined;

	private async load(): Promise<RoomRecord | undefined> {
		this.record ??= await this.ctx.storage.get<RoomRecord>("room");
		return this.record;
	}

	/** Sets the Room up; false when this code is already taken, so a code is never reused. */
	async create(record: RoomRecord): Promise<boolean> {
		if (await this.load()) return false;
		await this.ctx.storage.put("room", record);
		this.record = record;
		return true;
	}

	async fetch(request: Request): Promise<Response> {
		const room = await this.load();
		if (!room) return refusedSocket("not_found");
		const person = JSON.parse(request.headers.get(ROOM_IDENTITY_HEADER) ?? "null") as RosterEntry | null;
		if (!person) return refusedSocket("bad_identity");
		if (room.kind === "solo" && person.id !== room.creatorId) return refusedSocket("solo");

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(person);
		this.broadcast({ type: "room", room: this.snapshot(room) });
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		try {
			// Complete the close handshake. Not with the browser's code: 1005/1006/1015 can't be sent.
			ws.close(1000);
		} catch {
			// Already closed.
		}
		const room = await this.load();
		if (room) this.broadcast({ type: "room", room: this.snapshot(room, ws) }, ws);
	}

	/** Everyone connected, once each (a person may have several tabs open). */
	private snapshot(room: RoomRecord, leaving?: WebSocket): RoomSnapshot {
		const roster = new Map<string, RosterEntry>();
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === leaving) continue;
			const person = ws.deserializeAttachment() as RosterEntry;
			if (!roster.has(person.id)) roster.set(person.id, person);
		}
		return { code: room.code, kind: room.kind, roster: [...roster.values()] };
	}

	private broadcast(message: ServerMessage, leaving?: WebSocket): void {
		const text = JSON.stringify(message);
		for (const ws of this.ctx.getWebSockets()) {
			if (ws === leaving) continue;
			try {
				ws.send(text);
			} catch {
				// Closing already: webSocketClose will update the others.
			}
		}
	}
}
