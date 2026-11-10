import type { RoomSnapshot } from "../../../shared/rooms";
import { Roster } from "../components/Roster";

/** The Room before a Match: who is here. Starting a Match comes with the next slice. */
export function Lobby({ room, meId }: { room: RoomSnapshot; meId?: string }) {
	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<p className="label-md text-muted-foreground">{room.kind === "solo" ? "Solo Room" : "Room"}</p>
				<h1 className="headline-md font-mono text-foreground">{room.code}</h1>
			</header>
			<Roster people={room.roster} meId={meId} />
		</section>
	);
}
