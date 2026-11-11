/** A Word's difficulty (GLOSSARY.md, Catalogue). */
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** A Word's spelling: one lowercase a–z word. */
export const isSpelling = (s: string) => /^[a-z]+$/.test(s);

export const isDifficulty = (d: unknown): d is Difficulty => DIFFICULTIES.includes(d as Difficulty);

/** A picture's R2 key: random hex, never derived from the Word. */
export const isPictureKey = (k: string) => /^[0-9a-f]{12,64}$/.test(k);

/**
 * What is wrong with a Word's Hint Letter positions, one message each; none
 * means fine. Hard Words only, distinct whole positions inside the spelling.
 * Shared by the import script's checks and the Worker's.
 */
export function hintProblems(spelling: string, difficulty: unknown, hints: unknown): string[] {
	if (hints == null) return [];
	if (!Array.isArray(hints)) return ["Hint Letter positions must be a list, such as [0, 3]"];
	if (!hints.length) return [];
	if (difficulty !== "hard") return ["Hint Letters are for hard Words only"];
	const problems: string[] = [];
	const seen = new Set<unknown>();
	for (const p of hints) {
		if (!Number.isInteger(p) || p < 0 || p >= spelling.length) problems.push(`Hint Letter position ${p} is outside ${spelling} (0–${spelling.length - 1})`);
		else if (seen.has(p)) problems.push(`Hint Letter position ${p} is listed twice`);
		seen.add(p);
	}
	return problems;
}

/** `POST /api/cli/catalogue/words`: a Word whose picture is already in R2. */
export type NewWord = {
	spelling: string;
	difficulty: Difficulty;
	/** 0-based positions of the Hint Letters; hard Words only, else null. */
	hintPositions: number[] | null;
	pictureKey: string;
};

/** `GET /api/cli/catalogue/spellings`: every spelling in the Catalogue. */
export type CatalogueSpellingsResponse = { spellings: string[] };
/** `POST /api/cli/catalogue/words`: the new Word's id. */
export type NewWordResponse = { id: string };
