/**
 * The `words.hint_positions` column: a JSON array of 0-based positions, or
 * null when the Word has no Hint Letters (an empty list is stored as null).
 */
export function encodeHintPositions(positions: readonly number[] | null | undefined): string | null {
	return positions?.length ? JSON.stringify(positions) : null;
}

export function decodeHintPositions(column: string | null): number[] {
	return column ? (JSON.parse(column) as number[]) : [];
}
