/**
 * Every Blacksmith token and component state on one page, to check the theme by eye (issue #18).
 * Development only: App.tsx mounts it at /dev/theme when `import.meta.env.DEV`, so production builds leave it out.
 * The hover rows force the hover look with the same classes the components use on :hover.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const colours = [
	["primary", "bg-brand-primary"],
	["secondary", "bg-brand-secondary"],
	["tertiary", "bg-brand-tertiary"],
	["neutral", "bg-brand-neutral"],
	["surface", "bg-brand-surface"],
	["on-surface", "bg-brand-on-surface"],
	["background", "bg-brand-background"],
	["accent", "bg-brand-accent"],
	["text", "bg-brand-text"],
	["border", "bg-brand-border"],
	["info", "bg-brand-info"],
	["error", "bg-brand-error"],
] as const;

const typeStyles = [
	["headline-display", "headline-display", "SpellSprint"],
	["headline-lg", "headline-lg", "Spell it before the clock does"],
	["headline-md", "headline-md", "Round 3 of 5"],
	["headline-sm", "headline-sm", "Players in the Room"],
	["body-lg", "body-lg", "Guess the word from the picture. Every letter counts."],
	["body-md", "body-md", "The fastest correct guess wins the Round."],
	["body-sm", "body-sm", "Rooms close after ten minutes without a Match."],
	["label-lg", "label-lg", "START MATCH"],
	["label-md", "label-md", "JOIN ROOM"],
	["label-sm", "label-sm", "ROOM CODE"],
	["code-md", "code-md", "spellsprint.app/r/QX7P"],
] as const;

const radii = [
	["none", "rounded-none"],
	["sm 4px", "rounded-sm"],
	["md 8px", "rounded-md"],
	["lg 16px", "rounded-lg"],
	["xl 32px", "rounded-xl"],
	["full", "rounded-full"],
] as const;

const spacing = [
	["xs 2px", "w-0.5"],
	["sm 16px", "w-4"],
	["md 40px", "w-10"],
	["lg 48px", "w-12"],
	["gutter 32px", "w-gutter"],
	["xl / section 96px", "w-section"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className="headline-sm text-foreground">{title}</h2>
			{children}
		</section>
	);
}

export function ThemeSample() {
	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-12 p-4 md:p-gutter">
			<header className="flex flex-col gap-2">
				<span className="label-sm text-muted-foreground">DEV · /dev/theme</span>
				<h1 className="headline-md text-foreground">Blacksmith theme (light)</h1>
				<p className="body-md text-brand-text">Every token and component state from blacksmith.sh-design.md.</p>
			</header>

			<Section title="Colours">
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
					{colours.map(([name, bg]) => (
						<div key={name} className="flex flex-col gap-2">
							<div className={`h-16 rounded-md border ${bg}`} />
							<span className="label-sm">{name}</span>
							<span className="code-md text-muted-foreground">{bg}</span>
						</div>
					))}
				</div>
			</Section>

			<Section title="Type">
				<div className="flex flex-col gap-4 overflow-hidden">
					{typeStyles.map(([name, cls, sample]) => (
						<div key={name} className="flex flex-col gap-1 border-b pb-4">
							<span className="label-sm text-muted-foreground">{name}</span>
							<span className={`${cls} text-foreground`}>{sample}</span>
						</div>
					))}
				</div>
			</Section>

			<Section title="Radii">
				<div className="flex flex-wrap gap-4">
					{radii.map(([name, cls]) => (
						<div key={name} className="flex flex-col items-center gap-2">
							<div className={`size-16 border-2 border-brand-secondary bg-brand-primary ${cls}`} />
							<span className="label-sm">{name}</span>
						</div>
					))}
				</div>
			</Section>

			<Section title="Spacing">
				<div className="flex flex-col gap-2">
					{spacing.map(([name, cls]) => (
						<div key={name} className="flex items-center gap-4">
							<span className="label-sm w-40">{name}</span>
							<div className={`h-4 bg-brand-secondary ${cls}`} />
						</div>
					))}
				</div>
			</Section>

			<Section title="Buttons">
				<div className="flex flex-col gap-4">
					<Row label="primary">
						<Button size="xl">START MATCH</Button>
						<Button>Default size</Button>
						<Button size="sm">Small</Button>
						<Button className="bg-primary-hover">Hover</Button>
						<Button disabled>Disabled</Button>
					</Row>
					<Row label="secondary">
						<Button size="xl" variant="secondary">JOIN ROOM</Button>
						<Button variant="secondary">Default size</Button>
						<Button variant="secondary" size="sm">Small</Button>
						<Button variant="secondary" className="shadow-[inset_0_0_0_2px_var(--color-primary)]">Hover</Button>
						<Button variant="secondary" disabled>Disabled</Button>
					</Row>
					<Row label="link">
						<Button variant="link">Leave Room</Button>
						<Button variant="link" className="underline">Hover</Button>
						<Button variant="link" disabled>Disabled</Button>
					</Row>
					<Row label="others">
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="destructive">Destructive</Button>
					</Row>
				</div>
			</Section>

			<Section title="Card">
				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="headline-sm">Public Room</CardTitle>
							<CardDescription>3 of 8 Seats taken</CardDescription>
						</CardHeader>
						<CardContent className="body-md">Card: background, 8px corners, 16px padding, thin border.</CardContent>
						<CardFooter>
							<Button variant="link">Join</Button>
						</CardFooter>
					</Card>
				</div>
			</Section>

			<Section title="Input">
				<div className="grid max-w-md gap-4">
					<Input placeholder="Placeholder" />
					<Input defaultValue="Filled" />
					<Input defaultValue="Hover" className="border-ring" />
					<Input defaultValue="Invalid" aria-invalid />
					<Input defaultValue="Disabled" disabled />
				</div>
			</Section>

			<Section title="Chip">
				<Row label="chip">
					<Badge variant="chip">ROUND 2</Badge>
					<Badge variant="chip">GUEST</Badge>
					<Badge asChild variant="chip">
						<a href="#chip">LINK CHIP</a>
					</Badge>
					<Badge asChild variant="chip" className="bg-info/80">
						<a href="#chip">HOVER</a>
					</Badge>
				</Row>
			</Section>
		</main>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<span className="label-sm text-muted-foreground">{label}</span>
			<div className="flex flex-wrap items-center gap-4">{children}</div>
		</div>
	);
}
