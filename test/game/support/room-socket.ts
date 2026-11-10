import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { app } from "../../../src/worker/index";
import { roomSocketPath, type ServerMessage } from "../../../src/shared/rooms";

type MessageOf<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

/**
 * A fake browser on a Room's WebSocket: it connects through the Worker, as a
 * real one does, and records every message. Tests assert on what it received,
 * never on the Room's internals (spec #3, Testing Decisions).
 */
export type RoomSocket = {
	/** Every message so far, in order. */
	readonly received: ServerMessage[];
	readonly closed: boolean;
	/** The first message of this type (and matching `where`) received so far or within `timeoutMs`. */
	next<T extends ServerMessage["type"]>(type: T, where?: (message: MessageOf<T>) => boolean, timeoutMs?: number): Promise<MessageOf<T>>;
	/** Whether any message of this type has arrived. */
	got(type: ServerMessage["type"]): boolean;
	send(message: unknown): void;
	close(): void;
};

export async function openRoomSocket(code: string, token: string): Promise<RoomSocket> {
	const res = await app.request(roomSocketPath(code, token), { headers: { Upgrade: "websocket" } }, env);
	expect(res.status).toBe(101);
	const ws = res.webSocket!;
	const received: ServerMessage[] = [];
	const wakers = new Set<() => void>();
	const wake = () => wakers.forEach((w) => w());
	let closed = false;
	ws.addEventListener("message", (event) => {
		received.push(JSON.parse(event.data as string) as ServerMessage);
		wake();
	});
	ws.addEventListener("close", () => {
		closed = true;
		wake();
	});
	ws.accept();

	const find = <T extends ServerMessage["type"]>(type: T, where: (m: MessageOf<T>) => boolean) =>
		received.find((m): m is MessageOf<T> => m.type === type && where(m as MessageOf<T>));

	return {
		received,
		get closed() {
			return closed;
		},
		got: (type) => received.some((m) => m.type === type),
		async next(type, where = () => true, timeoutMs = 2000) {
			const deadline = Date.now() + timeoutMs;
			for (;;) {
				const found = find(type, where);
				if (found) return found;
				const left = deadline - Date.now();
				if (left <= 0 || closed) throw new Error(`no "${type}" message; received ${JSON.stringify(received)}`);
				await new Promise<void>((resolve) => {
					const done = () => {
						clearTimeout(timer);
						wakers.delete(done);
						resolve();
					};
					const timer = setTimeout(done, left);
					wakers.add(done);
				});
			}
		},
		send: (message) => ws.send(JSON.stringify(message)),
		close: () => ws.close(1000),
	};
}
