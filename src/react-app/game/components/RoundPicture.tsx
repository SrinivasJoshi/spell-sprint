/**
 * The Round's picture: square, as large as the space its parent leaves it (the
 * smaller of its width and height), so the Blanks and keyboard below stay on screen.
 * Its alt text must not give the Word away.
 */
export function RoundPicture({ src }: { src: string }) {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
			<img src={src} alt="What is this?" className="size-[min(100cqw,100cqh)] rounded-lg border border-border bg-card object-cover" draggable={false} />
		</div>
	);
}
