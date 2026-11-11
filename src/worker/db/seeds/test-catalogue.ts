import { dbNow, ignoreConflict } from "../index";
import type { Seed } from "./index";

/**
 * A small Catalogue for tests and local play: `npm run db:seed -- --file test-catalogue`.
 * Picture keys are random, as the import script makes them, so a URL never
 * gives the Word away. Only the D1 rows: the pictures themselves come with the
 * import script (#17); tests put stand-ins in R2.
 */
export const TEST_CATALOGUE = [
	{ id: "test-word-01", spelling: "apple", difficulty: "easy", pictureKey: "9f2c41d07a6e" },
	{ id: "test-word-02", spelling: "house", difficulty: "easy", pictureKey: "3b81e5c9f420" },
	{ id: "test-word-03", spelling: "guitar", difficulty: "medium", pictureKey: "c7d05a2e18b3" },
	{ id: "test-word-04", spelling: "pencil", difficulty: "medium", pictureKey: "5e9a1f6c03d7" },
	{ id: "test-word-05", spelling: "penguin", difficulty: "medium", pictureKey: "a0b4e8d2c61f" },
	{ id: "test-word-06", spelling: "umbrella", difficulty: "hard", pictureKey: "e61d3c9b5a08" },
	{ id: "test-word-07", spelling: "elephant", difficulty: "hard", pictureKey: "28f7b0e4d95c" },
] as const;

/** The test Word a picture URL shows, as a Player who recognises the picture would know it (tests only). */
export function testWordFor(pictureUrl: string): string {
	const word = TEST_CATALOGUE.find((w) => pictureUrl.endsWith(`/${w.pictureKey}`));
	if (!word) throw new Error(`no test Word for ${pictureUrl}`);
	return word.spelling;
}

export const testCatalogue: Seed = async (db) => {
	for (const word of TEST_CATALOGUE) {
		await ignoreConflict(
			db.insertInto("words").values({
				id: word.id,
				spelling: word.spelling,
				difficulty: word.difficulty,
				hint_positions: null,
				picture_key: word.pictureKey,
				created_at: dbNow(),
			}),
		).execute();
	}
};
