import { useEffect, useState } from "react";

/**
 * Milliseconds left of `ms`, counted from when the caller mounts (when the
 * Room's message arrived), so a wrong browser clock can't skew it. Updated
 * every animation frame until it reaches 0.
 */
export function useTimeLeft(ms: number): number {
	const [left, setLeft] = useState(ms);
	useEffect(() => {
		const end = performance.now() + ms;
		let frame = requestAnimationFrame(function tick() {
			const now = Math.max(0, end - performance.now());
			setLeft(now);
			if (now > 0) frame = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(frame);
	}, [ms]);
	return left;
}
