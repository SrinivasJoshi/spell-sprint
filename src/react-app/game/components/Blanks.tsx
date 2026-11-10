import { cn } from "@/lib/utils";
import type { Blanks as BlanksModel } from "../state/blanks";

/**
 * One box per slot. The cursor's box is outlined; given slots look filled in.
 * A wrong guess replays the shake (keyed by the number of wrong guesses).
 */
export function Blanks({ blanks }: { blanks: BlanksModel }) {
	const solved = blanks.status === "solved";
	return (
		<div
			key={blanks.wrongCount}
			role="group"
			aria-label={solved ? "Solved" : "Your guess"}
			className={cn("flex flex-wrap justify-center gap-1.5", blanks.wrongCount > 0 && "motion-safe:animate-shake")}
		>
			{blanks.cells.map((ch, i) => (
				<span
					// A slot is its position: the layout never changes within a Round.
					// eslint-disable-next-line react-x/no-array-index-key
					key={i}
					data-slot-kind={blanks.slots[i].kind}
					className={cn(
						"code-md flex size-10 items-center justify-center rounded-md border-2 uppercase sm:size-12",
						solved ? "border-brand-secondary bg-brand-primary text-brand-secondary" : "border-border bg-card text-foreground",
						blanks.slots[i].kind === "given" && "bg-muted text-muted-foreground",
						i === blanks.cursor && "border-foreground",
					)}
				>
					{ch ?? ""}
				</span>
			))}
		</div>
	);
}
