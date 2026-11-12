import { useTimeLeft } from "../hooks/useTimeLeft";

/** The Round's time left, as a bar of the whole `total` and seconds, counted down from `ms` when it mounts (the Round start's arrival). */
export function RoundTimer({ ms, total = ms }: { ms: number; total?: number }) {
	const left = useTimeLeft(ms);
	const seconds = Math.ceil(left / 1000);
	return (
		<div className="flex items-center gap-3" role="timer" aria-label={`${seconds} seconds left`}>
			<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
				<div className="h-full rounded-full bg-foreground" style={{ width: `${(left / total) * 100}%` }} />
			</div>
			<span className="label-md w-8 text-right text-foreground tabular-nums">{seconds}</span>
		</div>
	);
}
