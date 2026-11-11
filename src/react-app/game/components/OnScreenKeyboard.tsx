import { useRef, type ReactNode } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/**
 * A–Z and backspace for touch devices (ADR 0003: never a native input, whose
 * predictive suggestions would spell the Word). Shown only where the main
 * pointer is coarse; desktop types on the physical keyboard.
 *
 * Keys act on pointer down, not click, so a tap lands at once and the button
 * never takes focus. A click with no pointer down before it (a screen reader,
 * keyboard activation) still counts; the one that ends a tap doesn't.
 */
export function OnScreenKeyboard({ onKey, disabled }: { onKey: (key: string) => void; disabled?: boolean }) {
	const props = { onKey, disabled };

	return (
		// touch-none: a drag that starts on a key never scrolls or zooms the page.
		<div role="group" aria-label="Keyboard" className="hidden touch-none flex-col gap-2 pointer-coarse:flex">
			{ROWS.map((row, i) => (
				<div key={row} className={cn("flex gap-1", i === 1 && "px-[5%]")}>
					{[...row].map((ch) => (
						<Key key={ch} value={ch} label={ch.toUpperCase()} {...props}>
							{ch}
						</Key>
					))}
					{i === ROWS.length - 1 && (
						<Key value="Backspace" label="Backspace" wide {...props}>
							<Delete className="size-5" aria-hidden />
						</Key>
					)}
				</div>
			))}
		</div>
	);
}

type KeyProps = {
	value: string;
	label: string;
	wide?: boolean;
	children: ReactNode;
	onKey: (key: string) => void;
	disabled?: boolean;
};

function Key({ value, label, wide, children, onKey, disabled }: KeyProps) {
	// A pointer down already typed this key, so the click ending that press isn't counted again
	// (however long the press). Per key, because two thumbs overlap: one key's click must not consume another's.
	const pressed = useRef(false);
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onPointerDown={(e) => {
				e.preventDefault();
				pressed.current = true;
				onKey(value);
			}}
			onPointerCancel={() => (pressed.current = false)}
			onClick={() => {
				if (!pressed.current) onKey(value);
				pressed.current = false;
			}}
			className={cn(
				"label-lg flex h-12 min-w-0 flex-1 items-center justify-center rounded-md bg-card text-foreground uppercase ring-1 ring-border",
				"select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] active:bg-muted",
				"outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
				wide && "flex-[1.5]",
			)}
		>
			{children}
		</button>
	);
}
