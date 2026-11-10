import { Hono } from "hono";
import { isRoomCode, roomPagePath, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type CreateRoomRequest, type CreateRoomResponse, type RosterEntry } from "../../shared/rooms";
import { AppError } from "../lib/errors";
import { verifyGuestToken } from "../lib/guest-token";
import { refusedSocket } from "../rooms/refuse";
import { ROOM_IDENTITY_HEADER } from "../rooms/room";
import type { AppBindings } from "../types/context";

export const rooms = new Hono<AppBindings>();

/** Uniform over the alphabet: bytes at or above the largest multiple of its length are drawn again. */
function randomCode(): string {
	const n = ROOM_CODE_ALPHABET.length;
	const limit = 256 - (256 % n);
	let code = "";
	while (code.length < ROOM_CODE_LENGTH) {
		for (const b of crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))) {
			if (b < limit && code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[b % n];
		}
	}
	return code;
}

/** Create a Room. Guests only for now; rate-limited per IP so nobody can flood Rooms. */
rooms.post("/", async (c) => {
	const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
	const limiter = c.env.ROOM_CREATE_RATE_LIMITER;
	if (limiter && !(await limiter.limit({ key: ip })).success) {
		throw new AppError(429, "You've created a lot of Rooms in a short time. Please wait a minute and try again.", {
			code: "room_rate_limited",
			log: `room creation rate limit for ${ip}`,
		});
	}

	const body = (await c.req.json<Partial<CreateRoomRequest>>().catch(() => ({}))) as Partial<CreateRoomRequest>;
	if (body.kind !== "solo") throw new AppError(400, "That kind of Room can't be created.", { code: "bad_room_kind", log: `kind ${String(body.kind)}` });
	const guest = await verifyGuestToken(c.env, typeof body.token === "string" ? body.token : undefined);
	if (!guest) throw new AppError(401, "We couldn't tell who you are. Reload the page and try again.", { code: "bad_identity", log: "room creation with a missing or invalid Guest token" });

	// A taken code is never reused: draw again (31^6 codes make this rare).
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = randomCode();
		const stub = c.env.ROOM.get(c.env.ROOM.idFromName(code));
		if (await stub.create({ code, kind: body.kind, creatorId: guest.id })) {
			return c.json<CreateRoomResponse>({ code, url: roomPagePath(code) });
		}
	}
	throw new AppError(503, "We couldn't create a Room just now. Please try again.", { code: "room_code_exhausted", log: "five Room codes in a row were taken" });
});

/**
 * The Room's WebSocket. Browsers cannot set headers on a WebSocket, so the
 * Guest token comes in the query string. The Worker checks it and tells the
 * Room who is connecting; refusals are sent over the socket (lib refuse.ts).
 */
rooms.get("/:code/ws", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
		throw new AppError(426, "This address is for the game's live connection.", { log: "Room socket without an Upgrade header" });
	}
	const code = c.req.param("code").toUpperCase();
	if (!isRoomCode(code)) return refusedSocket("not_found");
	const guest = await verifyGuestToken(c.env, c.req.query("token"));
	if (!guest) return refusedSocket("bad_identity");

	const person: RosterEntry = { id: guest.id, name: guest.name, identity: "guest" };
	const res = await c.env.ROOM.get(c.env.ROOM.idFromName(code)).fetch("https://room/connect", {
		headers: { Upgrade: "websocket", [ROOM_IDENTITY_HEADER]: JSON.stringify(person) },
	});
	// A fresh Response: the Room's has immutable headers, which the version middleware writes to.
	return new Response(null, { status: res.status, webSocket: res.webSocket });
});
