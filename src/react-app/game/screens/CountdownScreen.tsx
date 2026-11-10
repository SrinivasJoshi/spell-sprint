import { Countdown } from "../components/Countdown";

/** Between Rounds: the countdown to the next picture. */
export function CountdownScreen({ round, ms }: { round: number; ms: number }) {
	return (
		<section className="flex flex-1 items-center justify-center">
			<Countdown key={round} round={round} ms={ms} />
		</section>
	);
}
