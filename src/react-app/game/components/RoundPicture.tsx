/** The Round's picture: square, at most the width of the column. Its alt text must not give the Word away. */
export function RoundPicture({ src }: { src: string }) {
	return <img src={src} alt="What is this?" className="aspect-square w-full rounded-lg border border-border bg-card object-cover" draggable={false} />;
}
