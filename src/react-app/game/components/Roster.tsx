import type { RosterEntry } from "../../../shared/rooms";
import { IdentityIcon } from "./IdentityIcon";

export function Roster({ people, meId }: { people: RosterEntry[]; meId?: string }) {
	return (
		<ul aria-label="People in the Room" className="flex flex-col gap-2">
			{people.map((person) => (
				<li key={person.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
					<IdentityIcon identity={person.identity} />
					<span className="body-md text-foreground">{person.name}</span>
					{person.id === meId && <span className="label-sm ml-auto text-muted-foreground">You</span>}
				</li>
			))}
		</ul>
	);
}
