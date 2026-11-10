import { Button } from "@/components/ui/button";
import type { RoomSnapshot } from "../../../shared/rooms";
import { Roster } from "../components/Roster";

/** The Room before a Match: who is here, and Start for the Host. */
export function Lobby({ room, meId, notice, onStart }: { room: RoomSnapshot; meId?: string; notice?: string; onStart: () => void }) {
	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<p className="label-md text-muted-foreground">{room.kind === "solo" ? "Solo Room" : "Room"}</p>
				<h1 className="headline-md font-mono text-foreground">{room.code}</h1>
			</header>
			<Roster people={room.roster} meId={meId} />
			{notice && (
				<p role="alert" className="body-sm text-destructive">
					{notice}
				</p>
			)}
			<Button size="xl" variant="secondary" onClick={onStart}>
				Start
			</Button>
		</section>
	);
}
