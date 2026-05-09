import {
	type CSSProperties,
	type ReactElement,
	useMemo,
	useState,
} from "react";
import type { LocalEngine } from "./ports/local-engine.js";

type ScreenId =
	| "onboarding"
	| "inventory"
	| "typescript-standards"
	| "drift"
	| "write-planner";

type ScreenDefinition = {
	id: ScreenId;
	label: string;
	kicker: string;
	title: string;
	status: "ready" | "next" | "pending";
	metrics: readonly ScreenMetric[];
	actions: readonly string[];
};

type ScreenMetric = {
	label: string;
	value: string;
	tone: "neutral" | "good" | "warn";
};

export type RudelDesktopAppProps = {
	localEngine: LocalEngine;
};

const onboardingScreen: ScreenDefinition = {
	id: "onboarding",
	label: "Onboarding",
	kicker: "Roots",
	title: "Choose workspace and agent roots",
	status: "next",
	metrics: [
		{ label: "Workspace roots", value: "0", tone: "warn" },
		{ label: "Global folders", value: "Off", tone: "neutral" },
		{ label: "GitHub identity", value: "Later", tone: "neutral" },
	],
	actions: ["Add root", "Toggle globals", "Run scan"],
};

const screenDefinitions: readonly ScreenDefinition[] = [
	onboardingScreen,
	{
		id: "inventory",
		label: "Inventory",
		kicker: "All skills",
		title: "Detected local skill and context files",
		status: "pending",
		metrics: [
			{ label: "Groups", value: "0", tone: "neutral" },
			{ label: "Managed", value: "0", tone: "neutral" },
			{ label: "Unmanaged", value: "0", tone: "neutral" },
		],
		actions: ["Group skills", "Open TypeScript Standards"],
	},
	{
		id: "typescript-standards",
		label: "TypeScript Standards",
		kicker: "Managed blueprint",
		title: "Focus one canonical skill across repos",
		status: "ready",
		metrics: [
			{ label: "Blueprint", value: "Available", tone: "good" },
			{ label: "Copies", value: "0", tone: "neutral" },
			{ label: "Targets", value: "5", tone: "good" },
		],
		actions: ["View matrix", "Compile targets"],
	},
	{
		id: "drift",
		label: "Drift",
		kicker: "Classification",
		title: "Current, missing, modified, behind, conflict",
		status: "pending",
		metrics: [
			{ label: "Current", value: "0", tone: "neutral" },
			{ label: "Modified", value: "0", tone: "neutral" },
			{ label: "Missing", value: "0", tone: "neutral" },
		],
		actions: ["Open detail", "Resolve intent"],
	},
	{
		id: "write-planner",
		label: "Write Planner",
		kicker: "Local mechanics",
		title: "Preview generated files before Rust writes",
		status: "pending",
		metrics: [
			{ label: "Create", value: "0", tone: "neutral" },
			{ label: "Modify", value: "0", tone: "neutral" },
			{ label: "Skip", value: "0", tone: "neutral" },
		],
		actions: ["Create plan", "Preview diff", "Apply"],
	},
];

const statusLabels: Record<ScreenDefinition["status"], string> = {
	next: "Next",
	pending: "Pending",
	ready: "Ready",
};

export function RudelDesktopApp(props: RudelDesktopAppProps): ReactElement {
	const [activeScreenId, setActiveScreenId] = useState<ScreenId>("onboarding");
	const activeScreen = useMemo(
		() =>
			screenDefinitions.find((screen) => screen.id === activeScreenId) ??
			onboardingScreen,
		[activeScreenId],
	);

	return (
		<div style={styles.shell}>
			<aside style={styles.sidebar} aria-label="Rudel sections">
				<div style={styles.brandBlock}>
					<div style={styles.brandMark}>R</div>
					<div>
						<div style={styles.brandTitle}>Rudel Desktop</div>
						<div style={styles.brandSubtitle}>Skill Blueprints</div>
					</div>
				</div>

				<nav style={styles.nav}>
					{screenDefinitions.map((screen) => {
						const isActive = screen.id === activeScreen.id;
						return (
							<button
								key={screen.id}
								type="button"
								onClick={() => setActiveScreenId(screen.id)}
								style={{
									...styles.navButton,
									...(isActive ? styles.navButtonActive : {}),
								}}
							>
								<span style={styles.navButtonText}>{screen.label}</span>
								<span style={statusStyle(screen.status)}>
									{statusLabels[screen.status]}
								</span>
							</button>
						);
					})}
				</nav>
			</aside>

			<main style={styles.main}>
				<section style={styles.headerBand}>
					<div>
						<div style={styles.kicker}>{activeScreen.kicker}</div>
						<h1 style={styles.title}>{activeScreen.title}</h1>
					</div>
					<div style={styles.headerActions}>
						<span style={styles.blueprintPill}>typescript-standards</span>
						<span style={statusStyle(activeScreen.status)}>
							{statusLabels[activeScreen.status]}
						</span>
					</div>
				</section>

				<section
					style={styles.metricGrid}
					aria-label={`${activeScreen.label} status`}
				>
					{activeScreen.metrics.map((metric) => (
						<div key={metric.label} style={styles.metricTile}>
							<div style={styles.metricLabel}>{metric.label}</div>
							<div style={metricValueStyle(metric.tone)}>{metric.value}</div>
						</div>
					))}
				</section>

				<section style={styles.workSurface}>
					<div style={styles.surfaceHeader}>
						<div>
							<div style={styles.surfaceTitle}>{activeScreen.label}</div>
							<div style={styles.surfaceSubtitle}>
								TypeScript owns drift classification. Rust owns local mechanics.
							</div>
						</div>
						<div style={styles.actionRow}>
							{activeScreen.actions.map((action) => (
								<button key={action} type="button" style={styles.commandButton}>
									{action}
								</button>
							))}
						</div>
					</div>

					<div style={styles.emptyState}>
						<div style={styles.emptyTitle}>Ready for the local drift loop</div>
						<div style={styles.emptyText}>
							The next slice wires roots, scan results, inventory grouping, and
							typescript-standards drift into this shell.
						</div>
					</div>
				</section>
			</main>

			<footer style={styles.statusBar}>
				<span>Roots: 0 selected</span>
				<span>Scan: idle</span>
				<span>Local engine: {props.localEngine ? "ready" : "missing"}</span>
				<span>API: local demo</span>
			</footer>
		</div>
	);
}

function statusStyle(status: ScreenDefinition["status"]): CSSProperties {
	const palette = {
		next: styles.statusNext,
		pending: styles.statusPending,
		ready: styles.statusReady,
	};
	return {
		...styles.statusPill,
		...palette[status],
	};
}

function metricValueStyle(tone: ScreenMetric["tone"]): CSSProperties {
	const palette = {
		good: styles.metricGood,
		neutral: styles.metricNeutral,
		warn: styles.metricWarn,
	};
	return {
		...styles.metricValue,
		...palette[tone],
	};
}

const styles = {
	shell: {
		minHeight: "100svh",
		display: "grid",
		gridTemplateColumns: "248px minmax(0, 1fr)",
		gridTemplateRows: "minmax(0, 1fr) 40px",
		background: "#f6f5f2",
		color: "#1e2421",
		fontFamily:
			'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
	} satisfies CSSProperties,
	sidebar: {
		gridRow: "1 / 3",
		borderRight: "1px solid #dedbd2",
		background: "#fbfaf7",
		padding: 18,
		display: "flex",
		flexDirection: "column",
		gap: 24,
	} satisfies CSSProperties,
	brandBlock: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		minHeight: 44,
	} satisfies CSSProperties,
	brandMark: {
		width: 36,
		height: 36,
		borderRadius: 8,
		display: "grid",
		placeItems: "center",
		background: "#24352d",
		color: "#ffffff",
		fontWeight: 700,
	} satisfies CSSProperties,
	brandTitle: {
		fontSize: 15,
		fontWeight: 700,
		lineHeight: 1.2,
	} satisfies CSSProperties,
	brandSubtitle: {
		marginTop: 2,
		color: "#68736c",
		fontSize: 12,
	} satisfies CSSProperties,
	nav: {
		display: "flex",
		flexDirection: "column",
		gap: 6,
	} satisfies CSSProperties,
	navButton: {
		minHeight: 44,
		width: "100%",
		border: "1px solid transparent",
		borderRadius: 8,
		background: "transparent",
		color: "#2d332f",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "0 10px",
		font: "inherit",
		cursor: "pointer",
	} satisfies CSSProperties,
	navButtonActive: {
		background: "#edf2ed",
		borderColor: "#c9d7cb",
	} satisfies CSSProperties,
	navButtonText: {
		fontSize: 13,
		fontWeight: 650,
	} satisfies CSSProperties,
	main: {
		minWidth: 0,
		padding: 24,
		display: "flex",
		flexDirection: "column",
		gap: 18,
	} satisfies CSSProperties,
	headerBand: {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "flex-start",
		gap: 16,
	} satisfies CSSProperties,
	kicker: {
		color: "#68736c",
		fontSize: 12,
		fontWeight: 700,
		textTransform: "uppercase",
		letterSpacing: 0,
	} satisfies CSSProperties,
	title: {
		margin: "6px 0 0",
		fontSize: 28,
		lineHeight: 1.15,
		letterSpacing: 0,
	} satisfies CSSProperties,
	headerActions: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
		justifyContent: "flex-end",
	} satisfies CSSProperties,
	blueprintPill: {
		minHeight: 28,
		display: "inline-flex",
		alignItems: "center",
		borderRadius: 8,
		border: "1px solid #d7d2c5",
		background: "#ffffff",
		padding: "0 10px",
		fontSize: 12,
		fontWeight: 650,
		color: "#39443d",
	} satisfies CSSProperties,
	statusPill: {
		minHeight: 24,
		display: "inline-flex",
		alignItems: "center",
		borderRadius: 8,
		padding: "0 8px",
		fontSize: 11,
		fontWeight: 700,
	} satisfies CSSProperties,
	statusNext: {
		background: "#fff3cf",
		color: "#6d5200",
	} satisfies CSSProperties,
	statusPending: {
		background: "#ebe8df",
		color: "#625f57",
	} satisfies CSSProperties,
	statusReady: {
		background: "#dff1e2",
		color: "#1c6630",
	} satisfies CSSProperties,
	metricGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
		gap: 12,
	} satisfies CSSProperties,
	metricTile: {
		minHeight: 86,
		borderRadius: 8,
		border: "1px solid #dedbd2",
		background: "#ffffff",
		padding: 14,
		display: "flex",
		flexDirection: "column",
		justifyContent: "space-between",
	} satisfies CSSProperties,
	metricLabel: {
		color: "#68736c",
		fontSize: 12,
		fontWeight: 650,
	} satisfies CSSProperties,
	metricValue: {
		fontSize: 22,
		fontWeight: 750,
		lineHeight: 1,
		letterSpacing: 0,
	} satisfies CSSProperties,
	metricGood: {
		color: "#207239",
	} satisfies CSSProperties,
	metricNeutral: {
		color: "#1e2421",
	} satisfies CSSProperties,
	metricWarn: {
		color: "#8a5a00",
	} satisfies CSSProperties,
	workSurface: {
		minHeight: 360,
		borderRadius: 8,
		border: "1px solid #dedbd2",
		background: "#ffffff",
		display: "flex",
		flexDirection: "column",
	} satisfies CSSProperties,
	surfaceHeader: {
		minHeight: 72,
		borderBottom: "1px solid #ece8de",
		padding: 16,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
	} satisfies CSSProperties,
	surfaceTitle: {
		fontSize: 16,
		fontWeight: 750,
	} satisfies CSSProperties,
	surfaceSubtitle: {
		marginTop: 4,
		fontSize: 12,
		color: "#68736c",
	} satisfies CSSProperties,
	actionRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 8,
		flexWrap: "wrap",
	} satisfies CSSProperties,
	commandButton: {
		minHeight: 36,
		borderRadius: 8,
		border: "1px solid #cfd8d0",
		background: "#f7faf7",
		color: "#223127",
		padding: "0 12px",
		font: "inherit",
		fontSize: 12,
		fontWeight: 700,
		cursor: "pointer",
	} satisfies CSSProperties,
	emptyState: {
		flex: 1,
		display: "grid",
		placeContent: "center",
		padding: 32,
		textAlign: "center",
	} satisfies CSSProperties,
	emptyTitle: {
		fontSize: 18,
		fontWeight: 750,
	} satisfies CSSProperties,
	emptyText: {
		maxWidth: 520,
		marginTop: 8,
		color: "#68736c",
		fontSize: 13,
		lineHeight: 1.5,
	} satisfies CSSProperties,
	statusBar: {
		gridColumn: "2",
		borderTop: "1px solid #dedbd2",
		background: "#fbfaf7",
		display: "flex",
		alignItems: "center",
		gap: 18,
		padding: "0 24px",
		color: "#68736c",
		fontSize: 12,
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
