import type { RosterEntry } from "../../../shared/rooms";
import { IdentityIcon } from "./IdentityIcon";

/** Who is in the Room, the Host marked, and those whose connection dropped (their place is held a while). */
export function Roster({ people, meId, hostId, awayIds = [] }: { people: RosterEntry[]; meId?: string; hostId?: string; awayIds?: string[] }) {
	return (
		<ul aria-label="People in the Room" className="flex flex-col gap-2">
			{people.map((person) => (
				<li key={person.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
					<IdentityIcon identity={person.identity} />
					<span className="body-md text-foreground">{person.name}</span>
					{person.id === hostId && <span className="label-sm text-muted-foreground">Host</span>}
					{awayIds.includes(person.id) && <span className="label-sm text-muted-foreground">Reconnecting…</span>}
					{person.id === meId && <span className="label-sm ml-auto text-muted-foreground">You</span>}
				</li>
			))}
		</ul>
	);
}
