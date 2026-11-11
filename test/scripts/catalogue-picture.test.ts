import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_PICTURE_BYTES, pictureSize, toSquareWebp } from "../../bin/lib/catalogue/picture";

/** A noisy PNG: random pixels are the hardest case for the size limit. */
const noisyPng = (width: number, height: number) => sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toBuffer();

describe("pictures", () => {
	it("reads a picture's size", async () => {
		expect(await pictureSize(await noisyPng(800, 600))).toEqual({ width: 800, height: 600 });
	});

	it("turns a large non-square picture into a square WebP within the size limit", async () => {
		const webp = await toSquareWebp(await noisyPng(2048, 1600));
		const meta = await sharp(webp).metadata();
		expect(meta.format).toBe("webp");
		expect(meta.width).toBe(meta.height);
		expect(webp.byteLength).toBeLessThanOrEqual(MAX_PICTURE_BYTES);
		expect(MAX_PICTURE_BYTES).toBe(150 * 1024);
	}, 30_000);
});
