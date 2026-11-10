import { useTimeLeft } from "../hooks/useTimeLeft";

/** The 3, 2, 1 before a Round's picture appears. */
export function Countdown({ round, ms }: { round: number; ms: number }) {
	const seconds = Math.max(1, Math.ceil(useTimeLeft(ms) / 1000));
	return (
		<div className="flex flex-col items-center gap-2" aria-live="polite">
			<p className="label-md text-muted-foreground">Round {round}</p>
			<p className="headline-display text-foreground tabular-nums">{seconds}</p>
		</div>
	);
}
