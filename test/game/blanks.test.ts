import { describe, expect, it } from "vitest";
import { backspace, createBlanks, guessResult, typeLetter, type Blanks } from "../../src/react-app/game/state/blanks";
import type { Slot } from "../../src/shared/rooms";

const typed = (n: number): Slot[] => Array.from({ length: n }, () => ({ kind: "typed" }));

/** Types each letter in turn; returns the final Blanks and the guess submitted, if any. */
function typeAll(blanks: Blanks, letters: string): { blanks: Blanks; submitted?: string } {
	let submitted: string | undefined;
	for (const ch of letters) {
		const step = typeLetter(blanks, ch);
		blanks = step.blanks;
		submitted = step.submit ?? submitted;
	}
	return { blanks, submitted };
}

describe("the Blanks model", () => {
	it("starts empty with the cursor on the first typed slot", () => {
		const b = createBlanks(typed(3));
		expect(b.cells).toEqual([null, null, null]);
		expect(b.cursor).toBe(0);
	});

	it("fills slots left to right and moves the cursor", () => {
		const { blanks, submitted } = typeAll(createBlanks(typed(4)), "ca");
		expect(blanks.cells).toEqual(["c", "a", null, null]);
		expect(blanks.cursor).toBe(2);
		expect(submitted).toBeUndefined();
	});

	it("takes only letters a-z, lowercased", () => {
		const { blanks } = typeAll(createBlanks(typed(3)), "C1 -é");
		expect(blanks.cells).toEqual(["c", null, null]);
	});

	it("submits the guess when the last typed slot fills, and waits for the result", () => {
		const { blanks, submitted } = typeAll(createBlanks(typed(3)), "cat");
		expect(submitted).toBe("cat");
		expect(blanks.status).toBe("checking");
		expect(blanks.cursor).toBeNull();
		// Nothing more is taken while the guess is checked.
		expect(typeLetter(blanks, "x").blanks.cells).toEqual(["c", "a", "t"]);
		expect(backspace(blanks).cells).toEqual(["c", "a", "t"]);
	});

	it("backspace clears the last typed letter and moves the cursor back", () => {
		const { blanks } = typeAll(createBlanks(typed(4)), "dog");
		const back = backspace(blanks);
		expect(back.cells).toEqual(["d", "o", null, null]);
		expect(back.cursor).toBe(2);
		expect(backspace(backspace(backspace(back))).cells).toEqual([null, null, null, null]);
	});

	it("keeps the letters after a wrong guess, so only the wrong part needs fixing", () => {
		const { blanks } = typeAll(createBlanks(typed(3)), "cot");
		const wrong = guessResult(blanks, "wrong");
		expect(wrong.status).toBe("editing");
		expect(wrong.cells).toEqual(["c", "o", "t"]);
		expect(wrong.wrongCount).toBe(1);
		const fixed = typeAll(backspace(backspace(wrong)), "at");
		expect(fixed.submitted).toBe("cat");
	});

	it("locks after a correct guess", () => {
		const { blanks } = typeAll(createBlanks(typed(3)), "cat");
		const solved = guessResult(blanks, "correct");
		expect(solved.status).toBe("solved");
		expect(backspace(solved).cells).toEqual(["c", "a", "t"]);
		expect(typeLetter(solved, "x").submit).toBeUndefined();
	});

	it("skips given slots: the cursor never lands on them and the guess includes them", () => {
		const slots: Slot[] = [{ kind: "typed" }, { kind: "given", char: "a" }, { kind: "typed" }];
		const start = createBlanks(slots);
		expect(start.cells).toEqual([null, "a", null]);
		const one = typeLetter(start, "c").blanks;
		expect(one.cursor).toBe(2);
		expect(backspace(one).cursor).toBe(0);
		expect(typeLetter(one, "t").submit).toBe("cat");
	});
});
