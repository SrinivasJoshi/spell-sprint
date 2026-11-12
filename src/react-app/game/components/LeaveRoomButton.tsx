import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Leave Room, after a confirmation, so nobody leaves by accident. `playing`: a Match is under way, so points are at stake. */
export function LeaveRoomButton({ onLeave, playing, className }: { onLeave: () => void; playing: boolean; className?: string }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size="sm" className={className}>
					Leave Room
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Leave this Room?</AlertDialogTitle>
					<AlertDialogDescription>
						You give up your place in the Room at once.{playing && " Points you've scored stay on this Match's Podium."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Stay</AlertDialogCancel>
					<AlertDialogAction onClick={onLeave}>Leave Room</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
