import type { RoundStart } from "../../../shared/rooms";
import { Blanks } from "../components/Blanks";
import { OnScreenKeyboard } from "../components/OnScreenKeyboard";
import { RoundPicture } from "../components/RoundPicture";
import { RoundTimer } from "../components/RoundTimer";
import { useBlanks } from "../hooks/useBlanks";
import type { Blanks as BlanksModel } from "../state/blanks";
import type { GuessAnswer } from "../state/room";

type Props = RoundStart & {
	answer?: GuessAnswer;
	onGuess: (guess: string) => void;
};

/**
 * A Round in play: the picture, the timer and the Blanks, typed on the physical
 * keyboard or, on touch devices, the on-screen one. It takes the viewport's
 * height (less the page's padding) so the picture shrinks to keep everything on
 * one screen. Mount one per Round.
 */
export function RoundScreen({ round, rounds, pictureUrl, timeLimitMs, slots, answer, onGuess }: Props) {
	const { blanks, press } = useBlanks(slots, answer, onGuess);
	return (
		<section className="flex h-[calc(100dvh-3rem-var(--app-banner-h,0px))] flex-col gap-3 sm:gap-4">
			<p className="label-md text-muted-foreground">
				Round {round} of {rounds}
			</p>
			<RoundTimer ms={timeLimitMs} />
			<RoundPicture src={pictureUrl} />
			<Blanks blanks={blanks} />
			<p className="body-sm min-h-5 text-center text-muted-foreground" aria-live="polite">
				{statusLine(blanks.status, answer)}
			</p>
			<OnScreenKeyboard onKey={press} disabled={blanks.status === "solved"} />
		</section>
	);
}

function statusLine(status: BlanksModel["status"], answer?: GuessAnswer): string {
	if (status === "solved") return `Correct! +${answer?.points ?? 0}`;
	if (status === "checking") return "Checking…";
	if (answer?.result === "near-miss") return "Almost!";
	return answer?.result === "wrong" ? "Not quite. Try again." : "Type the word.";
}
