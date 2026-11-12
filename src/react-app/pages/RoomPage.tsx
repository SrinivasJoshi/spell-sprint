import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LeaveRoomButton } from "@/game/components/LeaveRoomButton";
import { useGuest } from "@/game/hooks/useGuest";
import { useRoom, type UseRoom } from "@/game/hooks/useRoom";
import { CountdownScreen } from "@/game/screens/CountdownScreen";
import { Lobby } from "@/game/screens/Lobby";
import { PodiumScreen } from "@/game/screens/PodiumScreen";
import { RevealScreen } from "@/game/screens/RevealScreen";
import { RoundScreen } from "@/game/screens/RoundScreen";
import { SpectatingScreen } from "@/game/screens/SpectatingScreen";
import { hostName, isSpectating, solvedByOthers, type InRoom } from "@/game/state/room";

/** `/r/:code`: connects as this browser's Guest and shows the Room's current screen. */
export function RoomPage() {
	const code = (useParams().code ?? "").toUpperCase();
	const guest = useGuest();
	const room = useRoom(code, guest?.token);
	const { state } = room;
	const failed = guest === null;
	const navigate = useNavigate();
	const leave = () => {
		room.leave();
		navigate("/");
	};

	return (
		<main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 p-6">
			{state.status === "connecting" && !failed && (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			)}
			{state.status === "in-room" && (
				<>
					{/* Out of the flow, in the corner every screen leaves free, so a Round keeps its full height. */}
					<LeaveRoomButton onLeave={leave} playing={state.room.phase === "playing"} className="absolute top-4 right-4" />
					<InRoomScreen state={state} meId={guest?.guest.id} room={room} />
					{state.reconnecting && (
						<p role="status" className="label-sm fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-2 text-muted-foreground shadow-sm">
							Reconnecting…
						</p>
					)}
				</>
			)}
			{(failed || state.status === "refused" || state.status === "left") && (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
					<p className="body-lg text-foreground">{state.status === "refused" ? state.message : state.status === "left" ? "You left this Room." : "We couldn't get you into the Room."}</p>
					<Button asChild>
						<Link to="/">Back home</Link>
					</Button>
				</div>
			)}
		</main>
	);
}

function InRoomScreen({ state, meId, room }: { state: InRoom; meId?: string; room: UseRoom }) {
	const { match } = state;
	const myTotal = (meId && state.scores[meId]) || 0;
	// At the Podium: the message's, or the snapshot's for a browser that arrived after it.
	const podium = match?.step === "over" ? match.podium : !match ? state.room.podium : undefined;
	if (podium) {
		return <PodiumScreen podium={podium} kind={state.room.kind} meId={meId} hostId={state.room.hostId} hostName={hostName(state)} notice={state.notice} onPlayAgain={room.start} />;
	}
	if (!match) {
		if (state.room.phase === "lobby") return <Lobby room={state.room} meId={meId} notice={state.notice} onStart={room.start} />;
		// Joined mid-Match: the Room's catch-up (the current Round) is on its way.
		return <p className="body-md m-auto text-muted-foreground">A Match is under way.</p>;
	}
	const spectating = isSpectating(state, meId);
	switch (match.step) {
		case "countdown":
			return <CountdownScreen round={match.round} ms={match.ms} spectating={spectating} />;
		case "round":
			if (spectating) return <SpectatingScreen key={match.round} {...match} solvedBy={solvedByOthers(state, meId)} />;
			return <RoundScreen key={match.round} {...match} answer={state.guess} onGuess={room.guess} solvedBy={solvedByOthers(state, meId)} />;
		case "reveal":
			return <RevealScreen round={match.round} word={match.word} myPoints={(meId && match.points[meId]) || 0} myTotal={myTotal} nextPictureUrl={match.nextPictureUrl} spectating={spectating} />;
	}
}
