import { UserRound } from "lucide-react";
import type { RosterEntry } from "../../../shared/rooms";

/** Marks a Guest in the roster; Accounts get their own icon when they can join, so a Guest can't pass as one. */
export function IdentityIcon({ identity }: { identity: RosterEntry["identity"] }) {
	return <UserRound aria-label={identity === "guest" ? "Guest" : undefined} className="size-5 text-muted-foreground" />;
}
