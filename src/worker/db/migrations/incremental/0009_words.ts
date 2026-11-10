import { sql, type Kysely } from "kysely";
import type { DatabaseKind } from "../../index";
import { columnTypes } from "../columns";
import { ensureTable, indexExists } from "../ensure";
import type { MigrationFactory } from "../types";

/**
 * Blankrace's Catalogue: one row per Word (GLOSSARY.md). The spelling is
 * unique ignoring case (an index on `lower(spelling)`), the picture key is
 * unique and random, so it never gives the Word away. `hint_positions` is a
 * JSON array of 0-based slot indexes, set on hard Words only. A new table:
 * purely additive. Shared with baseline.ts, which creates the same table.
 */
export async function createWordsTable(db: Kysely<unknown>, kind: DatabaseKind): Promise<void> {
	const t = columnTypes(kind);
	await ensureTable(db, kind, "words", (table) =>
		table
			.addColumn("id", t.id, (c) => c.primaryKey())
			.addColumn("spelling", t.short, (c) => c.notNull())
			.addColumn("difficulty", "varchar(8)", (c) => c.notNull())
			.addColumn("hint_positions", t.text)
			.addColumn("picture_key", t.short, (c) => c.notNull().unique())
			.addColumn("created_at", t.timestamp, (c) => c.notNull()),
	);
	// Checked on its own, so a run that stopped after the table still gets it.
	if (await indexExists(db as Kysely<any>, kind, "words", "idx_words_spelling")) return; // eslint-disable-line @typescript-eslint/no-explicit-any
	// MySQL wants an expression key part in its own parentheses.
	const lower = kind === "mysql" ? sql`(lower(spelling))` : sql`lower(spelling)`;
	await (db as Kysely<any>).schema.createIndex("idx_words_spelling").on("words").unique().expression(lower).execute(); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const words: MigrationFactory = (kind) => ({
	compatibility: "expand",
	up: (db: Kysely<unknown>) => createWordsTable(db, kind),
});
