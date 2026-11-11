import sharp from "sharp";

/** A Word's picture in R2 is at most this big. */
export const MAX_PICTURE_BYTES = 150 * 1024;
/** The side of a converted picture, unless the source is smaller. Sharp enough for a phone's full width. */
const TARGET_SIDE = 1024;
/** Tried in turn, largest file first, until one fits; then the side is halved and tried again. */
const QUALITIES = [82, 72, 62, 52, 42];

/** A picture's width and height in pixels. */
export type PixelSize = { width: number; height: number };

/** A picture's size in pixels, from its bytes or its path (which reads only the header). */
export async function pictureSize(input: Buffer | string): Promise<PixelSize> {
	const { width, height } = await sharp(input).metadata();
	return { width, height };
}

/**
 * The picture as a square WebP of at most MAX_PICTURE_BYTES: cropped around
 * its centre, scaled down, then compressed harder (and if needed, smaller)
 * until it fits. Metadata is dropped, so nothing of the source file travels.
 */
export async function toSquareWebp(input: Buffer): Promise<Buffer> {
	const { width, height } = await pictureSize(input);
	for (let side = Math.min(TARGET_SIDE, width, height); side >= 128; side = Math.floor(side / 2)) {
		for (const quality of QUALITIES) {
			const webp = await sharp(input).resize(side, side, { fit: "cover", position: "centre" }).webp({ quality }).toBuffer();
			if (webp.byteLength <= MAX_PICTURE_BYTES) return webp;
		}
	}
	throw new Error(`could not fit the picture in ${MAX_PICTURE_BYTES / 1024} KB`);
}
