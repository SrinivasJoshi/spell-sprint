import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { PodiumEntry, RoomKind } from "../../../shared/rooms";
import { Podium } from "../components/Podium";

type Props = { podium: PodiumEntry[]; kind: RoomKind; meId?: string; hostId: string; hostName?: string; notice?: string; onPlayAgain: () => void };

/** The end of a Match: the Podium, and for the Host Play again, which starts the next Match in this Room. */
export function PodiumScreen({ podium, kind, meId, hostId, hostName, notice, onPlayAgain }: Props) {
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
				{meId === hostId ? (
					<Button size="xl" variant="secondary" onClick={onPlayAgain}>
						Play again
					</Button>
				) : (
					<p className="body-md text-center text-muted-foreground">Waiting for {hostName ?? "the Host"} to start the next Match.</p>
				)}
				<Button asChild variant="outline">
					<Link to="/">Back home</Link>
				</Button>
			</div>
		</section>
	);
}
