import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogueSpellingsResponse, NewWord, NewWordResponse } from "../../../src/shared/catalogue";
import { pictureSize, type PixelSize } from "./picture";
import { PICTURE_FILE } from "./scan";

/** Where the Catalogue's pictures go: R2. */
export interface PictureStore {
	put(key: string, webp: Buffer): Promise<void>;
}

/** Where the Catalogue's Words go: D1. */
export interface WordStore {
	/** Every spelling already in the Catalogue. */
	spellings(): Promise<string[]>;
	/** Inserts a Word whose picture is uploaded; returns its id. */
	insert(word: NewWord): Promise<string>;
}

/** The curator's pictures folder. */
export interface PictureFolder {
	read(file: string): Promise<Buffer>;
	/** Each picture in the folder and its size. */
	sizes(): Promise<Map<string, PixelSize>>;
}

/** A target environment's Worker, reached like the other CLI commands: `/api/cli` with `x-api-key`. */
export type WorkerTarget = { baseUrl: string; apiKey: string };

async function catalogueRequest<T>(target: WorkerTarget, method: string, path: string, body?: RequestInit["body"], contentType?: string): Promise<T> {
	const res = await fetch(`${target.baseUrl}/api/cli/catalogue${path}`, {
		method,
		headers: { "x-api-key": target.apiKey, ...(contentType ? { "content-type": contentType } : {}) },
		body,
	});
	const data = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new Error(data.error || `HTTP ${res.status} on ${method} ${path}`);
	return data;
}

/** The environment's R2 bucket, through its Worker. */
export const workerPictureStore = (target: WorkerTarget): PictureStore => ({
	put: async (key, webp) => {
		await catalogueRequest(target, "PUT", `/pictures/${key}`, new Uint8Array(webp), "image/webp");
	},
});

/** The environment's D1 database, through its Worker. */
export const workerWordStore = (target: WorkerTarget): WordStore => ({
	spellings: async () => (await catalogueRequest<CatalogueSpellingsResponse>(target, "GET", "/spellings")).spellings,
	insert: async (word) => (await catalogueRequest<NewWordResponse>(target, "POST", "/words", JSON.stringify(word), "application/json")).id,
});

/** The pictures folder on disk. */
export const diskPictureFolder = (dir: string): PictureFolder => ({
	read: (file) => readFile(join(dir, file)),
	sizes: async () => {
		const files = (await readdir(dir)).filter((f) => PICTURE_FILE.test(f));
		return new Map(await Promise.all(files.map(async (f) => [f, await pictureSize(join(dir, f))] as const)));
	},
});
