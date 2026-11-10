import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "@/api/rooms";
import { Button } from "@/components/ui/button";
import { isHandledHttpError } from "@/lib/http";
import { useGuest } from "@/game/hooks/useGuest";

/** The public home page: no sign-in, a Guest from the first visit. */
export function Home() {
	const guest = useGuest();
	const navigate = useNavigate();
	const [creating, setCreating] = useState(false);

	async function createSolo() {
		if (!guest) return;
		setCreating(true);
		try {
			const { url } = await createRoom("solo", guest.token);
			navigate(url);
		} catch (error) {
			setCreating(false);
			// The HTTP layer has shown the reason (rate limit, network, ...); anything else is a bug.
			if (!isHandledHttpError(error)) throw error;
		}
	}

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-8 p-6 text-center">
			<h1 className="headline-display text-foreground">Blankrace</h1>
			{guest && (
				<p className="body-lg text-muted-foreground">
					Playing as <span className="font-semibold text-foreground">{guest.guest.name}</span>
				</p>
			)}
			<Button size="xl" variant="secondary" className="w-full" disabled={!guest || creating} onClick={createSolo}>
				Create Solo Room
			</Button>
		</main>
	);
}
