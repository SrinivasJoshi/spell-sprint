import { isSpelling } from "../../../src/shared/catalogue";
import type { CatalogueEntry, Manifest } from "./manifest";

/** The picture formats import can convert. */
export const PICTURE_FILE = /\.(png|jpe?g|webp)$/i;

/** The spelling a file name suggests, when it is one a–z word (`Scissors.png`); otherwise blank for the curator. */
function guessSpelling(file: string): string | null {
	const name = file.replace(PICTURE_FILE, "").toLowerCase();
	return isSpelling(name) ? name : null;
}

/**
 * The manifest after a scan of the pictures folder: existing entries as they
 * are, then one new entry per picture not yet listed, in folder order.
 */
export function scanEntries(manifest: Manifest, files: readonly string[]): Manifest {
	const listed = new Set(manifest.map((e) => e.file));
	const added = files
		.filter((f) => PICTURE_FILE.test(f) && !listed.has(f))
		.map((file): CatalogueEntry => ({ file, spelling: guessSpelling(file), difficulty: null, hintPositions: null, wordId: null }));
	return [...manifest, ...added];
}
