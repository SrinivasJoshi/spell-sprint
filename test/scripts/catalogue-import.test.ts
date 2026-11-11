import { describe, expect, it } from "vitest";
import { importCatalogue, type ImportDeps } from "../../bin/lib/catalogue/import";
import type { CatalogueEntry, Manifest } from "../../bin/lib/catalogue/manifest";
import type { NewWord } from "../../src/shared/catalogue";

const entry = (file: string, spelling: string, over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
	file,
	spelling,
	difficulty: "medium",
	hintPositions: null,
	wordId: null,
	...over,
});

/** Fake R2, fake D1 and a fake pictures folder, recording every write. */
function fakes(files: string[], catalogue: string[] = []) {
	const r2 = new Map<string, Buffer>();
	const words: Array<NewWord & { id: string }> = [];
	const saved: Manifest[] = [];
	const deps: ImportDeps = {
		pictures: { put: async (key, webp) => void r2.set(key, webp) },
		words: {
			spellings: async () => [...catalogue, ...words.map((w) => w.spelling)],
			insert: async (word) => {
				const id = `w${words.length + 1}`;
				words.push({ ...word, id });
				return id;
			},
		},
		folder: {
			read: async (file) => {
				if (!files.includes(file)) throw new Error(`missing ${file}`);
				return Buffer.from(`source ${file}`);
			},
			sizes: async () => new Map(files.map((f) => [f, { width: 2048, height: 2048 }])),
		},
		convert: async (source) => Buffer.from(`webp of ${source.toString()}`),
		save: async (manifest) => void saved.push(structuredClone(manifest)),
		log: () => {},
	};
	return { deps, r2, words, saved };
}

describe("importCatalogue", () => {
	it("uploads each new picture under a random key, inserts its Word and records the id", async () => {
		const { deps, r2, words, saved } = fakes(["a.png", "b.png"]);
		const manifest = [entry("a.png", "scissors"), entry("b.png", "guillotine", { difficulty: "hard", hintPositions: [0] })];

		const result = await importCatalogue(manifest, deps);

		expect(result).toEqual({ ok: true, imported: 2 });
		expect(words.map(({ spelling, difficulty, hintPositions }) => ({ spelling, difficulty, hintPositions }))).toEqual([
			{ spelling: "scissors", difficulty: "medium", hintPositions: null },
			{ spelling: "guillotine", difficulty: "hard", hintPositions: [0] },
		]);
		for (const w of words) {
			expect(w.pictureKey).toMatch(/^[0-9a-f]{12,}$/);
			expect(w.pictureKey).not.toContain(w.spelling);
		}
		expect(new Set(words.map((w) => w.pictureKey)).size).toBe(2);
		expect(r2.get(words[0].pictureKey)?.toString()).toBe("webp of source a.png");
		expect(saved.at(-1)?.map((e) => e.wordId)).toEqual(["w1", "w2"]);
	});

	it("writes nothing when any entry fails a check, and names every offender", async () => {
		const { deps, r2, words, saved } = fakes(["a.png", "b.png"], ["Ukulele"]);
		const manifest = [entry("a.png", "scissors"), entry("b.png", "ukulele"), entry("c.png", "bouquet")];

		const result = await importCatalogue(manifest, deps);

		expect(result).toEqual({
			ok: false,
			errors: ["b.png (ukulele): ukulele is already in the Catalogue", "c.png (bouquet): picture c.png is not in catalogue/pictures/"],
		});
		expect(r2.size).toBe(0);
		expect(words).toEqual([]);
		expect(saved).toEqual([]);
	});

	it("writes nothing when a picture fails to convert", async () => {
		const { deps, r2, words } = fakes(["a.png", "b.png"]);
		deps.convert = async (source) => {
			if (source.toString().includes("b.png")) throw new Error("corrupt");
			return Buffer.from("webp");
		};

		const result = await importCatalogue([entry("a.png", "scissors"), entry("b.png", "bouquet")], deps);

		expect(result).toEqual({ ok: false, errors: ["b.png (bouquet): could not convert the picture: corrupt"] });
		expect(r2.size).toBe(0);
		expect(words).toEqual([]);
	});

	it("imports only new entries on a second run", async () => {
		const { deps, words } = fakes(["a.png", "b.png"]);
		const manifest = [entry("a.png", "scissors")];
		await importCatalogue(manifest, deps);

		const second = await importCatalogue([...manifest, entry("b.png", "bouquet")], deps);

		expect(second).toEqual({ ok: true, imported: 1 });
		expect(words.map((w) => w.spelling)).toEqual(["scissors", "bouquet"]);
	});
});
