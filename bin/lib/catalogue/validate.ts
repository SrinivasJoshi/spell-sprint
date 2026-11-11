import { hintProblems, isDifficulty, isSpelling } from "../../../src/shared/catalogue";
import type { Environment } from "../../../src/cli/utils/db";
import { describeEntry, importedIn, type CatalogueEntry, type Manifest } from "./manifest";
import type { PixelSize } from "./picture";

/** Each picture file in `catalogue/pictures/` and its size in pixels. */
export type PictureSizes = ReadonlyMap<string, PixelSize>;

/** The smallest short side a picture may have: the WebP is never upscaled. */
export const MIN_PICTURE_SIDE = 512;
/** How long the long side may be against the short one: cropping cuts at most a quarter. */
const MAX_ASPECT = 4 / 3;

type Rule = (entry: CatalogueEntry, ctx: { pictures: PictureSizes }) => string[];

/** The spelling: present, one lowercase a–z word. */
const spellingRule: Rule = (e) => {
	if (!e.spelling) return ["spelling is missing"];
	return isSpelling(e.spelling) ? [] : [`spelling must be one lowercase a–z word, not "${e.spelling}"`];
};

/** The difficulty: one of the three. */
const difficultyRule: Rule = (e) => (isDifficulty(e.difficulty) ? [] : ["difficulty must be easy, medium or hard"]);

/** Hint Letters: hard Words only, distinct whole positions inside the spelling. */
const hintRule: Rule = (e) => hintProblems(e.spelling ?? "", e.difficulty, e.hintPositions);

/** The picture: there, big enough, and square or close enough to crop to square. */
const pictureRule: Rule = (e, { pictures }) => {
	const size = pictures.get(e.file);
	if (!size) return [`picture ${e.file} is not in catalogue/pictures/`];
	const short = Math.min(size.width, size.height);
	const long = Math.max(size.width, size.height);
	const dims = `${size.width}×${size.height}`;
	if (long / short > MAX_ASPECT) return [`picture is ${dims}; cropping it to square would cut more than a quarter`];
	if (short < MIN_PICTURE_SIDE) return [`picture is ${dims}; it needs to be at least ${MIN_PICTURE_SIDE} px on its short side`];
	return [];
};

/** Rules on one entry at a time. Add a rule (a new field's, say) here. */
const ENTRY_RULES: Rule[] = [spellingRule, difficultyRule, hintRule, pictureRule];

/**
 * Every problem with the entries not yet imported into `env`, each naming its entry; an
 * empty list means the import may start. Pure: the Catalogue's spellings and
 * the pictures' sizes come in, so nothing here touches disk or network.
 * Imported entries are part of the Catalogue already and only count for
 * duplicates.
 */
export function validateManifest(manifest: Manifest, env: Environment, catalogueSpellings: readonly string[], pictures: PictureSizes): string[] {
	const errors: string[] = [];
	const inCatalogue = new Set(catalogueSpellings.map((s) => s.toLowerCase()));
	const files = new Set<string>();
	const spellings = new Map<string, string>(); // spelling → file of the first pending entry with it
	for (const e of manifest) {
		const fail = (message: string) => errors.push(`${describeEntry(e)}: ${message}`);
		if (files.has(e.file)) fail(`picture ${e.file} is listed twice`);
		files.add(e.file);
		if (importedIn(e, env)) continue;
		for (const rule of ENTRY_RULES) rule(e, { pictures }).forEach(fail);
		const key = e.spelling?.toLowerCase();
		if (!key) continue;
		if (inCatalogue.has(key)) fail(`${e.spelling} is already in the Catalogue`);
		else if (spellings.has(key)) fail(`spelling ${e.spelling} is also used by ${spellings.get(key)}`);
		else spellings.set(key, e.file);
	}
	return errors;
}
