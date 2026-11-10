/**
 * Rooms and Guests: the HTTP request/response types and the Room's WebSocket
 * protocol, shared by the Worker and the browser. Vocabulary: GLOSSARY.md.
 */

/** Room codes avoid look-alikes: no 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function isRoomCode(value: string): boolean {
	return value.length === ROOM_CODE_LENGTH && [...value].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

/** Only Solo Rooms exist so far; Private and Public join this union later. */
export type RoomKind = "solo";

/** A Guest as its token carries it: no D1 row (ADR 0001). */
export type Guest = { id: string; name: string };

/** `POST /api/guest`: send the stored token, if any; get it back, or a new one when it is missing or invalid. */
export type GuestRequest = { token?: string };
export type GuestResponse = { token: string; guest: Guest };

/** `POST /api/rooms` */
export type CreateRoomRequest = { kind: RoomKind; token: string };
export type CreateRoomResponse = { code: string; url: string };

/** The browser route of a Room's page. */
export const roomPagePath = (code: string) => `/r/${code}`;

/** The Room's WebSocket: `GET /api/rooms/:code/ws?token=<Guest token>`. */
export const roomSocketPath = (code: string, token: string) => `/api/rooms/${code}/ws?token=${encodeURIComponent(token)}`;

export type RosterEntry = { id: string; name: string; identity: "guest" };

export type RoomSnapshot = { code: string; kind: RoomKind; roster: RosterEntry[] };

export type RefusalReason = "bad_identity" | "not_found" | "solo";

/** Close code a Room uses after sending a refusal (application range 4000-4999). */
export const ROOM_REFUSED_CLOSE_CODE = 4403;

export type ServerMessage =
	| { type: "room"; room: RoomSnapshot }
	| { type: "refused"; reason: RefusalReason; message: string };
