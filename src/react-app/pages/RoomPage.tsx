import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useGuest } from "@/game/hooks/useGuest";
import { useRoom } from "@/game/hooks/useRoom";
import { Lobby } from "@/game/screens/Lobby";

/** `/r/:code`: connects as this browser's Guest and shows the Room. */
export function RoomPage() {
	const code = (useParams().code ?? "").toUpperCase();
	const guest = useGuest();
	const state = useRoom(code, guest?.token);
	const failed = guest === null;

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 p-6">
			{state.status === "connecting" && !failed && (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			)}
			{state.status === "in-room" && <Lobby room={state.room} meId={guest?.guest.id} />}
			{(failed || state.status === "refused" || state.status === "disconnected") && (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
					<p className="body-lg text-foreground">{state.status === "refused" ? state.message : failed ? "We couldn't get you into the Room." : "The connection to the Room was lost."}</p>
					<Button asChild>
						<Link to="/">Back home</Link>
					</Button>
				</div>
			)}
		</main>
	);
}
