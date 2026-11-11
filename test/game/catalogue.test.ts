import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/worker/index";
import type { CatalogueSpellingsResponse, NewWord, NewWordResponse } from "../../src/shared/catalogue";
import { allSpellings, seedTestCatalogue } from "./support/catalogue";
import { cliRequest } from "./support/http";

beforeAll(seedTestCatalogue);

/** A call from the import script, as `bin/lib/catalogue/stores.ts` sends it. */
const cli = (path: string, init: RequestInit = {}, key?: string) => cliRequest(`/catalogue${path}`, init, key);

const insert = (word: NewWord) => cli("/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(word) });

describe("catalogue import endpoints", () => {
	it("refuse a caller without the CLI key", async () => {
		expect((await cli("/spellings", {}, "wrong")).status).toBe(401);
	});

	it("list the Catalogue's spellings", async () => {
		const res = await cli("/spellings");
		expect(res.status).toBe(200);
		expect(((await res.json()) as CatalogueSpellingsResponse).spellings).toEqual(expect.arrayContaining(allSpellings()));
	});

	it("store an uploaded picture that the picture route then serves", async () => {
		const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
		expect((await cli("/pictures/0123456789abcdef", { method: "PUT", headers: { "content-type": "image/webp" }, body: bytes })).status).toBe(200);
		const served = await app.request("/api/pictures/0123456789abcdef", {}, env);
		expect(served.headers.get("content-type")).toBe("image/webp");
		expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
	});

	it("refuse a picture that is not WebP or is over 150 KB", async () => {
		expect((await cli("/pictures/0123456789abcdee", { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(4) })).status).toBe(415);
		expect((await cli("/pictures/0123456789abcdee", { method: "PUT", headers: { "content-type": "image/webp" }, body: new Uint8Array(150 * 1024 + 1) })).status).toBe(413);
	});

	it("insert a Word, which Rounds can then draw", async () => {
		const res = await insert({ spelling: "guillotine", difficulty: "hard", hintPositions: [0, 5], pictureKey: "fedcba9876543210" });
		expect(res.status).toBe(200);
		const { id } = (await res.json()) as NewWordResponse;
		expect(id).toBeTruthy();
		expect(((await (await cli("/spellings")).json()) as CatalogueSpellingsResponse).spellings).toContain("guillotine");
	});

	it("refuse a spelling already in the Catalogue, ignoring case", async () => {
		const res = await insert({ spelling: "apple", difficulty: "easy", hintPositions: null, pictureKey: "aaaa00001111" });
		expect(res.status).toBe(409);
	});

	it("refuse a malformed Word", async () => {
		expect((await insert({ spelling: "Two Words", difficulty: "easy", hintPositions: null, pictureKey: "bbbb00001111" })).status).toBe(400);
		expect((await insert({ spelling: "mannequin", difficulty: "easy", hintPositions: [1], pictureKey: "bbbb00001111" })).status).toBe(400);
		expect((await insert({ spelling: "mannequin", difficulty: "hard", hintPositions: null, pictureKey: "../etc" })).status).toBe(400);
	});
});
