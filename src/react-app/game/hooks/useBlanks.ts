import { useCallback, useEffect, useRef, useState } from "react";
import type { Slot } from "../../../shared/rooms";
import { backspace, createBlanks, guessResult, typeLetter, type Blanks } from "../state/blanks";
import type { GuessAnswer } from "../state/room";

/**
 * The Blanks of one Round (mount it per Round), driven by the physical
 * keyboard. `press` is the same entry point for an on-screen keyboard. A
 * filled guess goes to `submit`; the Room's answer comes back as `answer`.
 */
export function useBlanks(slots: Slot[], answer: GuessAnswer | undefined, submit: (guess: string) => void) {
	const [blanks, setBlanks] = useState<Blanks>(() => createBlanks(slots));
	// The latest Blanks, read by key presses so a submit happens once (not inside a state updater).
	const current = useRef(blanks);
	const update = useCallback((next: Blanks) => {
		current.current = next;
		setBlanks(next);
	}, []);

	const press = useCallback(
		(key: string) => {
			if (key === "Backspace") return update(backspace(current.current));
			const step = typeLetter(current.current, key);
			update(step.blanks);
			if (step.submit) submit(step.submit);
		},
		[submit, update],
	);

	useEffect(() => {
		if (answer) update(guessResult(current.current, answer.result));
	}, [answer, update]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (event.key === "Backspace" || /^[a-zA-Z]$/.test(event.key)) {
				event.preventDefault();
				press(event.key);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [press]);

	return { blanks, press };
}
