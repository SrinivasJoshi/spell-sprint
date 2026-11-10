import { env } from "cloudflare:workers";
import { createDb } from "../../../src/worker/db";
import { TEST_CATALOGUE, testCatalogue } from "../../../src/worker/db/seeds/test-catalogue";

/** Stand-in picture bytes, one per Word: what the picture route must serve back. */
export const pictureBytes = (key: string) => new TextEncoder().encode(`picture ${key}`);

/** The test Catalogue in D1 and its pictures in R2, as the import script would leave them. */
export async function seedTestCatalogue(): Promise<void> {
	await testCatalogue(createDb(env), { kind: "sqlite" });
	for (const word of TEST_CATALOGUE) await env.PICTURES.put(word.pictureKey, pictureBytes(word.pictureKey), { httpMetadata: { contentType: "image/webp" } });
}

/** The Word a picture URL shows, as a Player who recognises the picture would know it. */
export function wordFor(pictureUrl: string): string {
	const word = TEST_CATALOGUE.find((w) => pictureUrl.endsWith(`/${w.pictureKey}`));
	if (!word) throw new Error(`no test Word for ${pictureUrl}`);
	return word.spelling;
}

export const allSpellings = () => TEST_CATALOGUE.map((w) => w.spelling);
