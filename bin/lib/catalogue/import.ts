import { randomBytes } from "node:crypto";
import type { Difficulty } from "../../../src/shared/catalogue";
import type { Environment } from "../../../src/cli/utils/db";
import { describeEntry, importedIn, type CatalogueEntry, type Manifest } from "./manifest";
import type { PictureFolder, PictureStore, WordStore } from "./stores";
import { validateManifest } from "./validate";

/** Everything the import touches, so tests pass fakes and each environment is only a different target. */
export type ImportDeps = {
	pictures: PictureStore;
	words: WordStore;
	folder: PictureFolder;
	/** Source picture → square WebP (picture.ts). */
	convert: (source: Buffer) => Promise<Buffer>;
	/** Writes the manifest back, with the ids imported so far. */
	save: (manifest: Manifest) => Promise<void>;
	log: (line: string) => void;
};

export type ImportResult = { ok: true; imported: number } | { ok: false; errors: string[] };

/** A pending entry whose checks have passed, with its picture ready to upload. */
type Ready = { entry: CatalogueEntry; webp: Buffer };

/** A random R2 key (`isPictureKey`): never derived from the spelling or the file name, so a URL gives nothing away. */
const pictureKey = () => randomBytes(8).toString("hex");

/** Step 1: check every pending entry against the Catalogue and the folder. */
async function check(manifest: Manifest, env: Environment, deps: ImportDeps): Promise<string[]> {
	const [spellings, sizes] = await Promise.all([deps.words.spellings(), deps.folder.sizes()]);
	return validateManifest(manifest, env, spellings, sizes);
}

/** Step 2: convert every pending picture, before anything is uploaded, so a bad file writes nothing. */
async function convertAll(pending: CatalogueEntry[], deps: ImportDeps): Promise<{ ready: Ready[]; errors: string[] }> {
	const ready: Ready[] = [];
	const errors: string[] = [];
	for (const entry of pending) {
		try {
			ready.push({ entry, webp: await deps.convert(await deps.folder.read(entry.file)) });
		} catch (error) {
			errors.push(`${describeEntry(entry)}: could not convert the picture: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { ready, errors };
}

/** Step 3: upload one picture and insert its Word; returns the Word's id. */
async function importOne({ entry, webp }: Ready, deps: ImportDeps): Promise<string> {
	const key = pictureKey();
	await deps.pictures.put(key, webp);
	return deps.words.insert({
		spelling: entry.spelling!,
		difficulty: entry.difficulty as Difficulty,
		hintPositions: entry.hintPositions?.length ? entry.hintPositions : null,
		pictureKey: key,
	});
}

/**
 * Imports the entries not yet in `env`'s Catalogue: check all, convert all, then upload and
 * insert one by one. Nothing is written unless every check and conversion
 * passes. Each imported entry gets its id under `wordId[env]` (set on the
 * manifest passed in) and the manifest is saved after each one, so a run that stops halfway
 * resumes where it stopped.
 */
export async function importCatalogue(manifest: Manifest, env: Environment, deps: ImportDeps): Promise<ImportResult> {
	const checkErrors = await check(manifest, env, deps);
	if (checkErrors.length) return { ok: false, errors: checkErrors };

	const pending = manifest.filter((e) => !importedIn(e, env));
	const { ready, errors } = await convertAll(pending, deps);
	if (errors.length) return { ok: false, errors };

	for (const item of ready) {
		item.entry.wordId = { ...item.entry.wordId, [env]: await importOne(item, deps) };
		await deps.save(manifest);
		deps.log(`imported ${describeEntry(item.entry)}`);
	}
	return { ok: true, imported: ready.length };
}
