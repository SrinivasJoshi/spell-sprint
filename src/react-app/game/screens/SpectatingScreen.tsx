import type { RoundStart } from "../../../shared/rooms";
import { Blanks } from "../components/Blanks";
import { RoundPicture } from "../components/RoundPicture";
import { RoundTimer } from "../components/RoundTimer";
import { createBlanks } from "../state/blanks";

/** What a Spectator is told on every Match screen. */
export const SPECTATING_NOTE = "You're watching this Match. You'll play in the next one.";

type Props = RoundStart & {
	/** The Players who have solved this Round, by name. */
	solvedBy?: string[];
};

/**
 * A Round watched by a Spectator: the picture, the timer and the empty Blanks,
 * with no keyboard. They play from the next Match.
 */
export function SpectatingScreen({ round, rounds, pictureUrl, timeLimitMs, timeLeftMs, slots, solvedBy = [] }: Props) {
	return (
		<section className="flex h-[calc(100dvh-3rem-var(--app-banner-h,0px))] flex-col gap-3 sm:gap-4">
			<p className="label-md text-muted-foreground">
				Round {round} of {rounds} · Watching
			</p>
			<RoundTimer ms={timeLeftMs} total={timeLimitMs} />
			<RoundPicture src={pictureUrl} />
			<Blanks blanks={createBlanks(slots)} />
			<p className="body-sm text-center text-muted-foreground">{SPECTATING_NOTE}</p>
			{solvedBy.length > 0 && (
				<p className="label-sm text-center text-muted-foreground" aria-live="polite">
					Solved: {solvedBy.join(", ")}
				</p>
			)}
		</section>
	);
}
