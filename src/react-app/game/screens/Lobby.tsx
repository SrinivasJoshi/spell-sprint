import { Button } from "@/components/ui/button";
import { roomPagePath, type RoomSnapshot } from "../../../shared/rooms";
import { RoomCodeShare } from "../components/RoomCodeShare";
import { Roster } from "../components/Roster";

/** The Room before a Match: how to invite people (Private), who is here, and Start for the Host. */
export function Lobby({ room, meId, notice, onStart }: { room: RoomSnapshot; meId?: string; notice?: string; onStart: () => void }) {
	const isHost = meId === room.hostId;
	const host = room.roster.find((p) => p.id === room.hostId);
	return (
		<section className="flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<p className="label-md text-muted-foreground">{room.kind === "solo" ? "Solo Room" : "Private Room"}</p>
				<h1 className="headline-md font-mono text-foreground">{room.code}</h1>
			</header>
			{room.kind === "private" && <RoomCodeShare link={`${location.origin}${roomPagePath(room.code)}`} />}
			<Roster people={room.roster} meId={meId} hostId={room.kind === "solo" ? undefined : room.hostId} />
			{notice && (
				<p role="alert" className="body-sm text-destructive">
					{notice}
				</p>
			)}
			{isHost ? (
				<Button size="xl" variant="secondary" onClick={onStart}>
					Start
				</Button>
			) : (
				<p className="body-md text-center text-muted-foreground">Waiting for {host?.name ?? "the Host"} to start the Match.</p>
			)}
		</section>
	);
}
