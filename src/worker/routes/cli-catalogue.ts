import { Hono } from "hono";
import { sql } from "kysely";
import { hintProblems, isDifficulty, isPictureKey, isSpelling, type CatalogueSpellingsResponse, type NewWord, type NewWordResponse } from "../../shared/catalogue";
import { createDb, dbNow } from "../db";
import { AppError } from "../lib/errors";
import type { AppBindings } from "../types/context";
import { cliAuthMiddleware } from "./cli";

/**
 * What `npm run catalogue:import` writes through, mounted at `/api/cli/catalogue`
 * and protected by the CLI key like the rest of `/api/cli`. The script checks
 * everything first; these routes check again, as the Worker must.
 */
export const cliCatalogue = new Hono<AppBindings>();

cliCatalogue.use("*", cliAuthMiddleware);

/** The import script converts pictures to at most 150 KB; anything bigger is refused. */
const MAX_PICTURE_BYTES = 150 * 1024;

/** Every spelling in the Catalogue, for the script's duplicate check. */
cliCatalogue.get("/spellings", async (c) => {
	const rows = await createDb(c.env).selectFrom("words").select("spelling").execute();
	return c.json({ spellings: rows.map((r) => r.spelling) } satisfies CatalogueSpellingsResponse);
});

/** A converted picture, stored in R2 under the random key the script picked. */
cliCatalogue.put("/pictures/:key", async (c) => {
	const key = c.req.param("key");
	if (!isPictureKey(key)) throw new AppError(400, "That picture key isn't valid.", { log: `picture key ${key}` });
	if (c.req.header("content-type") !== "image/webp") throw new AppError(415, "Pictures must be WebP.", { log: `picture ${key} as ${c.req.header("content-type")}` });
	const bytes = await c.req.arrayBuffer();
	if (bytes.byteLength > MAX_PICTURE_BYTES) throw new AppError(413, "That picture is over 150 KB.", { log: `picture ${key}: ${bytes.byteLength} bytes` });
	await c.env.PICTURES.put(key, bytes, { httpMetadata: { contentType: "image/webp" } });
	return c.json({ success: true });
});

/** Why a Word can't go in the Catalogue, or null: the import script's own checks, run again here. */
function wordProblem(w: Partial<NewWord>): string | null {
	if (typeof w.spelling !== "string" || !isSpelling(w.spelling)) return `spelling ${String(w.spelling)}`;
	if (!isDifficulty(w.difficulty)) return `difficulty ${String(w.difficulty)}`;
	if (typeof w.pictureKey !== "string" || !isPictureKey(w.pictureKey)) return `picture key ${String(w.pictureKey)}`;
	return hintProblems(w.spelling, w.difficulty, w.hintPositions)[0] ?? null;
}

/** A Word whose picture is in R2. A spelling already in the Catalogue, ignoring case, is refused. */
cliCatalogue.post("/words", async (c) => {
	const word = (await c.req.json<Partial<NewWord>>().catch(() => ({}))) as Partial<NewWord>;
	const problem = wordProblem(word);
	if (problem) throw new AppError(400, `That Word isn't valid: ${problem}.`, { log: problem });
	const { spelling, difficulty, hintPositions, pictureKey } = word as NewWord;

	const db = createDb(c.env);
	const exists = () => db.selectFrom("words").select("id").where(sql`lower(spelling)`, "=", spelling).executeTakeFirst();
	const refuse = (id: string) => new AppError(409, `${spelling} is already in the Catalogue.`, { code: "word_exists", log: `spelling ${spelling} is word ${id}` });
	const taken = await exists();
	if (taken) throw refuse(taken.id);

	const id = crypto.randomUUID();
	try {
		await db
			.insertInto("words")
			.values({ id, spelling, difficulty, hint_positions: hintPositions?.length ? JSON.stringify(hintPositions) : null, picture_key: pictureKey, created_at: dbNow() })
			.execute();
	} catch (error) {
		// Another import inserted the same spelling since the check: the unique index refused this one.
		const raced = await exists();
		if (raced) throw refuse(raced.id);
		throw error;
	}
	return c.json({ id } satisfies NewWordResponse);
});
