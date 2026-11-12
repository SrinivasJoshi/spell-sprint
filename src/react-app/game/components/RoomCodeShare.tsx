import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** How to invite people to a Room: its link, with a copy button. */
export function RoomCodeShare({ link }: { link: string }) {
	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			toast.success("Link copied.");
		} catch {
			// No clipboard (a plain-http address, a denied permission): the link is on screen to copy by hand.
			toast.error("Couldn't copy the link. Select it and copy it instead.");
		}
	}
	return (
		<div className="flex flex-col gap-2">
			<p className="body-sm text-muted-foreground">Share the code, or send this link to your friends:</p>
			<div className="flex items-center gap-2">
				<code className="code-md min-w-0 flex-1 truncate rounded-md border border-border bg-card px-3 py-2 select-all">{link}</code>
				<Button variant="outline" onClick={copy}>
					Copy link
				</Button>
			</div>
		</div>
	);
}
