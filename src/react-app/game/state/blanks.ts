import type { GuessResult, Slot } from "../../../shared/rooms";

/**
 * The Blanks as the Player fills them: plain data, no React (GLOSSARY.md, Blanks).
 *
 * Typed slots fill left to right; given slots arrive filled and the cursor
 * skips them. When the last typed slot fills, the guess is submitted and the
 * Blanks wait for the result: a wrong one hands them back with the letters
 * kept, a correct one locks them.
 */
export type Blanks = {
	slots: Slot[];
	/** One character per slot; null for an empty typed slot. */
	cells: (string | null)[];
	/** Index of the slot the next letter goes in; null when every typed slot is filled. */
	cursor: number | null;
	status: "editing" | "checking" | "solved";
	/** Wrong guesses so far, so a view can replay its shake on each one. */
	wrongCount: number;
};

const firstEmptyTyped = (slots: Slot[], cells: (string | null)[]): number | null => {
	const i = slots.findIndex((s, i) => s.kind === "typed" && cells[i] === null);
	return i === -1 ? null : i;
};

export function createBlanks(slots: Slot[]): Blanks {
	const cells = slots.map((s) => (s.kind === "given" ? s.char : null));
	return { slots, cells, cursor: firstEmptyTyped(slots, cells), status: "editing", wrongCount: 0 };
}

/** Puts a letter at the cursor. `submit` is the guess when this letter filled the last typed slot. */
export function typeLetter(blanks: Blanks, key: string): { blanks: Blanks; submit?: string } {
	const ch = key.toLowerCase();
	if (blanks.status !== "editing" || blanks.cursor === null || !/^[a-z]$/.test(ch)) return { blanks };
	const cells = blanks.cells.slice();
	cells[blanks.cursor] = ch;
	const cursor = firstEmptyTyped(blanks.slots, cells);
	if (cursor !== null) return { blanks: { ...blanks, cells, cursor } };
	return { blanks: { ...blanks, cells, cursor, status: "checking" }, submit: cells.join("") };
}

/** Clears the last typed letter; the cursor moves back to it. */
export function backspace(blanks: Blanks): Blanks {
	if (blanks.status !== "editing") return blanks;
	const end = blanks.cursor ?? blanks.slots.length;
	for (let i = end - 1; i >= 0; i--) {
		if (blanks.slots[i].kind === "typed") {
			const cells = blanks.cells.slice();
			cells[i] = null;
			return { ...blanks, cells, cursor: i };
		}
	}
	return blanks;
}

/**
 * The Room's answer to the submitted guess. A Near Miss is wrong too: the
 * Player edits on. Correct always locks, even with no guess pending: the Room
 * says so to a Player back after solving the Round (a reload or a dropped connection).
 */
export function guessResult(blanks: Blanks, result: GuessResult): Blanks {
	if (result === "correct") return { ...blanks, status: "solved" };
	if (blanks.status !== "checking") return blanks;
	return { ...blanks, status: "editing", wrongCount: blanks.wrongCount + 1 };
}
