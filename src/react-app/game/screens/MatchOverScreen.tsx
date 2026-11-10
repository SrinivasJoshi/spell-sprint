import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

/** The end of the Match. A plain stand-in until the Podium (#6). */
export function MatchOverScreen({ myTotal }: { myTotal: number }) {
	return (
		<section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<h1 className="headline-md text-foreground">Match over</h1>
			<p className="body-lg text-foreground">You scored {myTotal} points.</p>
			<Button asChild variant="outline">
				<Link to="/">Back home</Link>
			</Button>
		</section>
	);
}
