import { Command } from "commander";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getApiBaseUrl, normalizeEnvironment } from "../src/cli/utils/db";
import { importCatalogue } from "./lib/catalogue/import";
import type { Manifest } from "./lib/catalogue/manifest";
import { toSquareWebp } from "./lib/catalogue/picture";
import { scanEntries } from "./lib/catalogue/scan";
import { diskPictureFolder, workerPictureStore, workerWordStore } from "./lib/catalogue/stores";

/**
 * The curator's Catalogue workflow (issue #17):
 *   1. drop pictures in catalogue/pictures/
 *   2. `npm run catalogue:scan` lists them in catalogue/catalogue.json
 *   3. fill in spelling, difficulty and (hard Words) hintPositions
 *   4. `npm run catalogue:import -- --env local|preview|production`
 */
const CATALOGUE_DIR = resolve(process.cwd(), "catalogue");
const PICTURES_DIR = resolve(CATALOGUE_DIR, "pictures");
const MANIFEST = resolve(CATALOGUE_DIR, "catalogue.json");

/** The manifest, or an empty one; a file that is not a list of entries stops the command. */
function readManifest(): Manifest {
	if (!existsSync(MANIFEST)) return [];
	const parsed: unknown = JSON.parse(readFileSync(MANIFEST, "utf8"));
	if (!Array.isArray(parsed) || !parsed.every((e) => typeof e?.file === "string")) throw new Error(`${MANIFEST} must be a list of entries, each with a "file".`);
	return parsed as Manifest;
}
const writeManifest = (manifest: Manifest) => writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`);

const program = new Command().name("catalogue").description("Add Words to the Catalogue from a folder of pictures.");

program
	.command("scan")
	.description("List new pictures in catalogue/catalogue.json, leaving existing entries alone.")
	.action(() => {
		mkdirSync(PICTURES_DIR, { recursive: true });
		const before = readManifest();
		const after = scanEntries(before, readdirSync(PICTURES_DIR).sort());
		writeManifest(after);
		const added = after.length - before.length;
		console.log(`${added} new picture${added === 1 ? "" : "s"} listed in ${MANIFEST}${added ? ": fill in spelling, difficulty and hintPositions, then run catalogue:import." : "."}`);
	});

program
	.command("import")
	.description("Check catalogue.json, then convert, upload and insert each entry not yet imported.")
	.option("-e, --env <env>", "local, preview or production", "local")
	.action(async (options: { env?: string }) => {
		const env = normalizeEnvironment(options.env);
		const baseUrl = getApiBaseUrl(env); // also loads .env.<env>
		const apiKey = process.env.CLI_API_KEY;
		if (!apiKey) throw new Error(`catalogue:import needs CLI_API_KEY in .env.${env}.`);
		if (!existsSync(MANIFEST)) throw new Error(`No ${MANIFEST}. Run npm run catalogue:scan first.`);

		const target = { baseUrl, apiKey };
		console.log(`Importing into ${env} (${baseUrl})`);
		const result = await importCatalogue(readManifest(), {
			pictures: workerPictureStore(target),
			words: workerWordStore(target),
			folder: diskPictureFolder(PICTURES_DIR),
			convert: toSquareWebp,
			save: async (manifest) => writeManifest(manifest),
			log: (line) => console.log(`  ${line}`),
		});
		if (!result.ok) {
			console.error(`Nothing imported. Fix these in catalogue.json and run again:`);
			for (const error of result.errors) console.error(`  ${error}`);
			process.exitCode = 1;
			return;
		}
		console.log(result.imported ? `${result.imported} Word${result.imported === 1 ? "" : "s"} imported.` : "Nothing new to import.");
	});

program.parseAsync().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
