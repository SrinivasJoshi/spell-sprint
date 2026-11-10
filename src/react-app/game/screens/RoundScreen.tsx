import type { RoundStart } from "../../../shared/rooms";
import { Blanks } from "../components/Blanks";
import { RoundPicture } from "../components/RoundPicture";
import { RoundTimer } from "../components/RoundTimer";
import { useBlanks } from "../hooks/useBlanks";
import type { Blanks as BlanksModel } from "../state/blanks";
import type { GuessAnswer } from "../state/room";

type Props = RoundStart & {
	answer?: GuessAnswer;
	onGuess: (guess: string) => void;
};

/** A Round in play: the picture, the timer and the Blanks, typed on the physical keyboard. Mount one per Round. */
export function RoundScreen({ round, rounds, pictureUrl, timeLimitMs, slots, answer, onGuess }: Props) {
	const { blanks } = useBlanks(slots, answer, onGuess);
	return (
		<section className="flex flex-col gap-4">
			<p className="label-md text-muted-foreground">
				Round {round} of {rounds}
			</p>
			<RoundTimer ms={timeLimitMs} />
			<RoundPicture src={pictureUrl} />
			<Blanks blanks={blanks} />
			<p className="body-sm min-h-5 text-center text-muted-foreground" aria-live="polite">
				{statusLine(blanks.status, answer)}
			</p>
		</section>
	);
}

function statusLine(status: BlanksModel["status"], answer?: GuessAnswer): string {
	if (status === "solved") return `Correct! +${answer?.points ?? 0}`;
	if (status === "checking") return "Checking…";
	return answer?.result === "wrong" ? "Not quite. Try again." : "Type the word.";
}
