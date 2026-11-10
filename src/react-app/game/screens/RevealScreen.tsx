import { useEffect } from "react";
import { preload } from "react-dom";

type Props = { round: number; word: string; myPoints: number; myTotal: number; nextPictureUrl: string | null };

/** After a Round: the word and the points, while the next picture loads. */
export function RevealScreen({ round, word, myPoints, myTotal, nextPictureUrl }: Props) {
	useEffect(() => {
		if (nextPictureUrl) preload(nextPictureUrl, { as: "image" });
	}, [nextPictureUrl]);
	return (
		<section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
			<p className="label-md text-muted-foreground">Round {round}: the word was</p>
			<p className="headline-lg font-mono uppercase text-foreground">{word}</p>
			<p className="body-lg text-foreground">{myPoints > 0 ? `+${myPoints} points` : "No points this Round"}</p>
			<p className="label-md text-muted-foreground">Total: {myTotal}</p>
		</section>
	);
}
