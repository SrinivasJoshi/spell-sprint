import { Hono } from "hono";
import { AppError } from "../lib/errors";
import type { AppBindings } from "../types/context";

export const pictures = new Hono<AppBindings>();

/**
 * A Word's picture, from R2. Keys are random (the import script picks them),
 * so the URL never gives the Word away; a key's picture never changes, so
 * browsers may keep it for good. Public: a Round's picture needs no session.
 */
pictures.get("/:key", async (c) => {
	const key = c.req.param("key");
	const object = /^[A-Za-z0-9_-]{1,64}$/.test(key) ? await c.env.PICTURES.get(key) : null;
	if (!object) throw new AppError(404, "That picture doesn't exist.", { code: "picture_not_found", log: `no picture under ${key}` });
	return new Response(object.body, {
		headers: {
			"content-type": object.httpMetadata?.contentType ?? "image/webp",
			"cache-control": "public, max-age=31536000, immutable",
			etag: object.httpEtag,
		},
	});
});
