import { describe, expect, it } from "vitest";
import { validateManifest, type PictureSizes } from "../../bin/lib/catalogue/validate";
import type { CatalogueEntry } from "../../bin/lib/catalogue/manifest";

const entry = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
	file: "a.png",
	spelling: "scissors",
	difficulty: "medium",
	hintPositions: null,
	wordId: null,
	...over,
});

const square = { width: 2048, height: 2048 };
const sizes = (...files: string[]): PictureSizes => new Map(files.map((f) => [f, square]));

describe("validateManifest", () => {
	it("accepts a well-formed manifest", () => {
		const manifest = [entry(), entry({ file: "b.png", spelling: "guillotine", difficulty: "hard", hintPositions: [0, 5] })];
		expect(validateManifest(manifest, ["apple"], sizes("a.png", "b.png"))).toEqual([]);
	});

	it("wants one lowercase a–z word as the spelling", () => {
		const manifest = [entry({ spelling: null }), entry({ file: "b.png", spelling: "ice cream" }), entry({ file: "c.png", spelling: "Bouquet" })];
		expect(validateManifest(manifest, [], sizes("a.png", "b.png", "c.png"))).toEqual([
			"a.png (no spelling): spelling is missing",
			'b.png (ice cream): spelling must be one lowercase a–z word, not "ice cream"',
			'c.png (Bouquet): spelling must be one lowercase a–z word, not "Bouquet"',
		]);
	});

	it("refuses a spelling twice in the file, or one already in the Catalogue, ignoring case", () => {
		const manifest = [entry(), entry({ file: "b.png" }), entry({ file: "c.png", spelling: "ukulele" })];
		expect(validateManifest(manifest, ["Ukulele"], sizes("a.png", "b.png", "c.png"))).toEqual([
			"b.png (scissors): spelling scissors is also used by a.png",
			"c.png (ukulele): ukulele is already in the Catalogue",
		]);
	});

	it("refuses a picture listed twice or missing", () => {
		const manifest = [entry(), entry({ spelling: "bouquet" }), entry({ file: "gone.png", spelling: "mannequin" })];
		expect(validateManifest(manifest, [], sizes("a.png"))).toEqual([
			"a.png (bouquet): picture a.png is listed twice",
			"gone.png (mannequin): picture gone.png is not in catalogue/pictures/",
		]);
	});

	it("wants easy, medium or hard", () => {
		expect(validateManifest([entry({ difficulty: null })], [], sizes("a.png"))).toEqual(["a.png (scissors): difficulty must be easy, medium or hard"]);
		expect(validateManifest([entry({ difficulty: "tricky" as never })], [], sizes("a.png"))).toEqual(["a.png (scissors): difficulty must be easy, medium or hard"]);
	});

	it("allows Hint Letters on hard Words only, at distinct positions inside the spelling", () => {
		const manifest = [
			entry({ hintPositions: [1] }),
			entry({ file: "b.png", spelling: "bouquet", difficulty: "hard", hintPositions: [0, 7] }),
			entry({ file: "c.png", spelling: "ukulele", difficulty: "hard", hintPositions: [2, 2] }),
			entry({ file: "d.png", spelling: "mannequin", difficulty: "hard", hintPositions: [-1, 1.5] }),
		];
		expect(validateManifest(manifest, [], sizes("a.png", "b.png", "c.png", "d.png"))).toEqual([
			"a.png (scissors): Hint Letters are for hard Words only",
			"b.png (bouquet): Hint Letter position 7 is outside bouquet (0–6)",
			"c.png (ukulele): Hint Letter position 2 is listed twice",
			"d.png (mannequin): Hint Letter position -1 is outside mannequin (0–8)",
			"d.png (mannequin): Hint Letter position 1.5 is outside mannequin (0–8)",
		]);
	});

	it("wants Hint Letter positions as a list", () => {
		const manifest = [entry({ difficulty: "hard", hintPositions: 3 as never })];
		expect(validateManifest(manifest, [], sizes("a.png"))).toEqual(["a.png (scissors): Hint Letter positions must be a list, such as [0, 3]"]);
	});

	it("wants a picture that is square or crops to square without losing more than a quarter, at least 512 px", () => {
		const manifest = [entry(), entry({ file: "b.png", spelling: "bouquet" }), entry({ file: "c.png", spelling: "ukulele" })];
		const pictures: PictureSizes = new Map([
			["a.png", { width: 1600, height: 1200 }], // 4:3 crops fine
			["b.png", { width: 2000, height: 1000 }],
			["c.png", { width: 400, height: 400 }],
		]);
		expect(validateManifest(manifest, [], pictures)).toEqual([
			"b.png (bouquet): picture is 2000×1000; cropping it to square would cut more than a quarter",
			"c.png (ukulele): picture is 400×400; it needs to be at least 512 px on its short side",
		]);
	});

	it("checks only entries not yet imported, which are already in the Catalogue", () => {
		const manifest = [entry({ file: "gone.png", wordId: "w1" }), entry({ file: "b.png", spelling: "bouquet" })];
		expect(validateManifest(manifest, ["scissors"], sizes("b.png"))).toEqual([]);
	});
});
