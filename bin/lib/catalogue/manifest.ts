import type { Difficulty } from "../../../src/shared/catalogue";

/**
 * One entry of `catalogue/catalogue.json`: the shape shared by scan and import.
 * The curator fills in `spelling`, `difficulty` and `hintPositions`; import
 * sets `wordId` once the Word is in the Catalogue.
 */
export type CatalogueEntry = {
	/** The picture's file name in `catalogue/pictures/`. Never stored in the Catalogue. */
	file: string;
	spelling: string | null;
	difficulty: Difficulty | null;
	/** 0-based positions of the Hint Letters; hard Words only. */
	hintPositions: number[] | null;
	/** Set by import: the Word's id. An entry with one is skipped. */
	wordId: string | null;
};

/** The whole file: a list of entries. */
export type Manifest = CatalogueEntry[];

/** How an error names an entry: its file, and its spelling once there is one. */
export const describeEntry = (e: Pick<CatalogueEntry, "file" | "spelling">) => (e.spelling ? `${e.file} (${e.spelling})` : `${e.file} (no spelling)`);
