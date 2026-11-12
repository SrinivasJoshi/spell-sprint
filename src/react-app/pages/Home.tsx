import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "@/api/rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isHandledHttpError } from "@/lib/http";
import { useGuest } from "@/game/hooks/useGuest";
import { isRoomCode, ROOM_CODE_LENGTH, roomPagePath, type RoomKind } from "../../shared/rooms";

/** The public home page: no sign-in, a Guest from the first visit. */
export function Home() {
	const guest = useGuest();
	const navigate = useNavigate();
	const [creating, setCreating] = useState(false);
	const [code, setCode] = useState("");
	const [codeError, setCodeError] = useState<string>();

	async function create(kind: RoomKind) {
		if (!guest) return;
		setCreating(true);
		try {
			const { url } = await createRoom(kind, guest.token);
			navigate(url);
		} catch (error) {
			setCreating(false);
			// The HTTP layer has shown the reason (rate limit, network, ...); anything else is a bug.
			if (!isHandledHttpError(error)) throw error;
		}
	}

	/** A well-formed code goes to its Room's page, which says so if no Room has it. */
	function join(event: FormEvent) {
		event.preventDefault();
		const typed = code.trim().toUpperCase();
		if (!isRoomCode(typed)) return setCodeError(`A Room code is ${ROOM_CODE_LENGTH} letters and digits, like K7MQ2X.`);
		navigate(roomPagePath(typed));
	}

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-8 p-6 text-center">
			<h1 className="headline-display text-foreground">Blankrace</h1>
			{guest && (
				<p className="body-lg text-muted-foreground">
					Playing as <span className="font-semibold text-foreground">{guest.guest.name}</span>
				</p>
			)}
			<div className="flex w-full flex-col gap-3">
				<Button size="xl" variant="secondary" className="w-full" disabled={!guest || creating} onClick={() => create("solo")}>
					Create Solo Room
				</Button>
				<Button size="xl" className="w-full" disabled={!guest || creating} onClick={() => create("private")}>
					Create Private Room
				</Button>
			</div>
			<form onSubmit={join} className="flex w-full flex-col gap-2 text-left">
				<Label htmlFor="room-code" className="label-md text-muted-foreground">
					Join with a code
				</Label>
				<div className="flex gap-2">
					<Input
						id="room-code"
						value={code}
						onChange={(e) => {
							setCode(e.target.value);
							setCodeError(undefined);
						}}
						placeholder="K7MQ2X"
						autoComplete="off"
						autoCapitalize="characters"
						maxLength={ROOM_CODE_LENGTH}
						className="font-mono uppercase"
						aria-invalid={codeError ? true : undefined}
						aria-describedby={codeError ? "room-code-error" : undefined}
					/>
					<Button type="submit" variant="outline">
						Join
					</Button>
				</div>
				{codeError && (
					<p id="room-code-error" role="alert" className="body-sm text-destructive">
						{codeError}
					</p>
				)}
			</form>
		</main>
	);
}
