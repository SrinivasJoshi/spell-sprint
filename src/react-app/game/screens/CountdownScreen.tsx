import { Countdown } from "../components/Countdown";
import { SPECTATING_NOTE } from "./SpectatingScreen";

/** Between Rounds: the countdown to the next picture. `spectating`: watching this Match. */
export function CountdownScreen({ round, ms, spectating }: { round: number; ms: number; spectating?: boolean }) {
	return (
		<section className="flex flex-1 flex-col items-center justify-center gap-4">
			<Countdown key={round} round={round} ms={ms} />
			{spectating && <p className="body-md text-muted-foreground">{SPECTATING_NOTE}</p>}
		</section>
	);
}
