import type { Guest } from "../../shared/rooms";
import type { AppEnv } from "../types/env";

/**
 * Guest tokens (ADR 0001): `base64url(JSON guest).base64url(HMAC-SHA256)`,
 * signed with GUEST_TOKEN_SECRET. The browser keeps the token; the Worker
 * keeps nothing, so a valid signature is the whole proof of who a Guest is.
 */

/** Local dev and tests only; preview and production must set the secret. */
const DEV_SECRET = "blankrace-local-guest-token-secret";

function secretOf(env: Pick<AppEnv, "GUEST_TOKEN_SECRET" | "ENVIRONMENT">): string {
	const secret = env.GUEST_TOKEN_SECRET;
	if (secret) return secret;
	if (env.ENVIRONMENT === "local" || env.ENVIRONMENT === "test") return DEV_SECRET;
	throw new Error("GUEST_TOKEN_SECRET is not configured. Set it in .env.<env> and redeploy.");
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
	const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
	return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

function key(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signGuestToken(env: Pick<AppEnv, "GUEST_TOKEN_SECRET" | "ENVIRONMENT">, guest: Guest): Promise<string> {
	const payload = toBase64Url(encoder.encode(JSON.stringify({ id: guest.id, name: guest.name })));
	const signature = await crypto.subtle.sign("HMAC", await key(secretOf(env), "sign"), encoder.encode(payload));
	return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** The Guest a token was signed for, or null when it is missing, malformed or tampered with. */
export async function verifyGuestToken(env: Pick<AppEnv, "GUEST_TOKEN_SECRET" | "ENVIRONMENT">, token: string | null | undefined): Promise<Guest | null> {
	if (!token) return null;
	const [payload, signature, extra] = token.split(".");
	if (!payload || !signature || extra !== undefined) return null;
	try {
		const valid = await crypto.subtle.verify("HMAC", await key(secretOf(env), "verify"), fromBase64Url(signature), encoder.encode(payload));
		if (!valid) return null;
		const guest = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Partial<Guest>;
		return typeof guest.id === "string" && typeof guest.name === "string" ? { id: guest.id, name: guest.name } : null;
	} catch {
		return null;
	}
}

const ADJECTIVES = ["Swift", "Brave", "Clever", "Lucky", "Quiet", "Bright", "Bold", "Calm", "Eager", "Happy", "Jolly", "Keen", "Merry", "Nimble", "Proud", "Quick", "Sunny", "Witty", "Zesty", "Gentle"];
const ANIMALS = ["Fox", "Owl", "Otter", "Panda", "Tiger", "Falcon", "Badger", "Koala", "Lynx", "Moose", "Raven", "Seal", "Heron", "Wolf", "Bison", "Gecko", "Hare", "Lemur", "Puffin", "Yak"];

function pick<T>(list: readonly T[]): T {
	return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

/** A fresh Guest with a generated handle such as SwiftFox84. */
export function newGuest(): Guest {
	const number = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100).padStart(2, "0");
	return { id: crypto.randomUUID(), name: `${pick(ADJECTIVES)}${pick(ANIMALS)}${number}` };
}
