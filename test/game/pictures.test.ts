import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/worker/index";
import { TEST_CATALOGUE } from "../../src/worker/db/seeds/test-catalogue";
import { pictureBytes, seedTestCatalogue } from "./support/catalogue";

beforeAll(seedTestCatalogue);

const get = (path: string) => app.request(path, {}, env);

describe("pictures", () => {
	it("serves a Word's picture from R2 under its random key, cacheable for good", async () => {
		const { pictureKey } = TEST_CATALOGUE[0];
		const res = await get(`/api/pictures/${pictureKey}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/webp");
		expect(res.headers.get("cache-control")).toMatch(/immutable/);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(pictureBytes(pictureKey));
	});

	it("answers 404 for a key with no picture", async () => {
		expect((await get("/api/pictures/0000deadbeef")).status).toBe(404);
	});
});
