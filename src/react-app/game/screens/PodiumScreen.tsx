import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { PodiumEntry, RoomKind } from "../../../shared/rooms";
import { Podium } from "../components/Podium";

type Props = { podium: PodiumEntry[]; kind: RoomKind; meId?: string; notice?: string; onPlayAgain: () => void };

/** The end of a Match: the Podium, and Play again, which starts the next Match in this Room. */
export function PodiumScreen({ podium, kind, meId, notice, onPlayAgain }: Props) {
	const mine = podium.find((e) => e.playerId === meId);
	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<p className="label-md text-muted-foreground">Match over</p>
				<h1 className="headline-md text-foreground">{kind === "solo" && mine ? `You scored ${mine.points} points` : "Podium"}</h1>
			</header>
			<Podium entries={podium} meId={meId} />
			{notice && (
				<p role="alert" className="body-sm text-destructive">
					{notice}
				</p>
			)}
			<div className="flex flex-col gap-3">
				{/* Only Solo Rooms so far, where the one Player is the Host. */}
				<Button size="xl" variant="secondary" onClick={onPlayAgain}>
					Play again
				</Button>
				<Button asChild variant="outline">
					<Link to="/">Back home</Link>
				</Button>
			</div>
		</section>
	);
}
