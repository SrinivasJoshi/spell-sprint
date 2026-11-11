import { describe, expect, it } from "vitest";
import { scanEntries } from "../../bin/lib/catalogue/scan";
import type { CatalogueEntry } from "../../bin/lib/catalogue/manifest";

const blank = (file: string, spelling: string | null = null): CatalogueEntry => ({ file, spelling, difficulty: null, hintPositions: null, wordId: null });

describe("scanEntries", () => {
	it("adds one entry per picture, guessing the spelling only from a one-word file name", () => {
		const files = ["Gemini_Generated_Image_ff6ulfff6ulfff6u.png", "Scissors.PNG", "ukulele.webp", "ice cream.jpg", "bouquet2.jpeg"];
		expect(scanEntries([], files)).toEqual([
			blank("Gemini_Generated_Image_ff6ulfff6ulfff6u.png"),
			blank("Scissors.PNG", "scissors"),
			blank("ukulele.webp", "ukulele"),
			blank("ice cream.jpg"),
			blank("bouquet2.jpeg"),
		]);
	});

	it("ignores anything that is not a PNG, JPEG or WebP", () => {
		expect(scanEntries([], [".DS_Store", "notes.txt", "a.gif", "b.jpg"])).toEqual([blank("b.jpg", "b")]);
	});

	it("keeps existing entries as they are and appends only new pictures", () => {
		const existing: CatalogueEntry[] = [{ file: "x.png", spelling: "guillotine", difficulty: "hard", hintPositions: [0], wordId: { local: "w1" } }];
		expect(scanEntries(existing, ["x.png", "chandelier.png"])).toEqual([existing[0], blank("chandelier.png", "chandelier")]);
	});
});
