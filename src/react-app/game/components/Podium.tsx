import { cn } from "@/lib/utils";
import type { PodiumEntry } from "../../../shared/rooms";

/** The end-of-Match placings: every Player, with their place and points. Shared places show the same number. */
export function Podium({ entries, meId }: { entries: PodiumEntry[]; meId?: string }) {
	return (
		<ol aria-label="Podium" className="flex flex-col gap-2">
			{entries.map((entry) => (
				<li
					key={entry.playerId}
					className={cn("flex items-center gap-4 rounded-md border px-4 py-3", entry.place === 1 ? "border-brand-primary bg-brand-primary/10" : "border-border bg-card")}
				>
					<span className="headline-sm w-8 text-foreground" aria-label={`Place ${entry.place}`}>
						{entry.place}
					</span>
					<span className="body-md text-foreground">{entry.name}</span>
					{entry.playerId === meId && <span className="label-sm text-muted-foreground">You</span>}
					<span className="label-lg ml-auto text-foreground">{entry.points} pts</span>
				</li>
			))}
		</ol>
	);
}
