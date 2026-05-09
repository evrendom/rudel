import type { MachineScanResult, ScannedRoot } from "@rudel/skill-schema";
import {
	type CSSProperties,
	type ReactElement,
	useMemo,
	useState,
} from "react";
import {
	buildRepositoriesOverview,
	type RepoOverviewRow,
	type RepositoriesOverview,
} from "./features/repositories-overview/index.js";
import type { LocalEngine } from "./ports/local-engine.js";

type ScreenId =
	| "repositories"
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

type RootPreferences = {
	version: 1;
	workspaceRoots: string[];
	includeGlobalAgentFolders: boolean;
};

type ScanState =
	| { status: "idle" }
	| { status: "scanning" }
	| { status: "success"; result: MachineScanResult }
	| { status: "error"; message: string };

export type RudelDesktopAppProps = {
	localEngine: LocalEngine;
};

const rootPreferencesStorageKey = "rudel:repo-overview-preferences:v1";

const defaultRootPreferences: RootPreferences = {
	version: 1,
	workspaceRoots: [],
	includeGlobalAgentFolders: false,
};

const repositoriesScreen: ScreenDefinition = {
	id: "repositories",
	label: "Repositories",
	kicker: "Roots",
	title: "Local Git repositories",
	status: "next",
	metrics: [
		{ label: "Selected roots", value: "0", tone: "warn" },
		{ label: "Git repos", value: "0", tone: "neutral" },
		{ label: "Skill files", value: "0", tone: "neutral" },
	],
	actions: ["Run scan"],
};

const screenDefinitions: readonly ScreenDefinition[] = [
	repositoriesScreen,
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
	const [activeScreenId, setActiveScreenId] =
		useState<ScreenId>("repositories");
	const [rootPreferences, setRootPreferences] =
		useState<RootPreferences>(readRootPreferences);
	const [rootInput, setRootInput] = useState("");
	const [scanState, setScanState] = useState<ScanState>({ status: "idle" });
	const activeScreen = useMemo(
		() =>
			screenDefinitions.find((screen) => screen.id === activeScreenId) ??
			repositoriesScreen,
		[activeScreenId],
	);
	const scanResult =
		scanState.status === "success" ? scanState.result : undefined;
	const repositoriesOverview = useMemo(
		() => buildRepositoriesOverview(scanResult),
		[scanResult],
	);
	const activeMetrics =
		activeScreen.id === "repositories"
			? repositoryMetrics(rootPreferences, repositoriesOverview)
			: activeScreen.metrics;

	function updateRootPreferences(nextPreferences: RootPreferences) {
		setRootPreferences(nextPreferences);
		writeRootPreferences(nextPreferences);
	}

	function addWorkspaceRoot() {
		const normalizedInput = rootInput.trim();
		if (!normalizedInput) return;
		if (rootPreferences.workspaceRoots.includes(normalizedInput)) {
			setRootInput("");
			return;
		}
		updateRootPreferences({
			...rootPreferences,
			workspaceRoots: [...rootPreferences.workspaceRoots, normalizedInput],
		});
		setRootInput("");
	}

	function removeWorkspaceRoot(root: string) {
		updateRootPreferences({
			...rootPreferences,
			workspaceRoots: rootPreferences.workspaceRoots.filter(
				(workspaceRoot) => workspaceRoot !== root,
			),
		});
	}

	function toggleGlobalAgentFolders() {
		updateRootPreferences({
			...rootPreferences,
			includeGlobalAgentFolders: !rootPreferences.includeGlobalAgentFolders,
		});
	}

	async function runScan() {
		setScanState({ status: "scanning" });
		try {
			const result = await props.localEngine.scanMachine({
				roots: rootPreferences.workspaceRoots,
				includeGlobalAgentFolders: rootPreferences.includeGlobalAgentFolders,
			});
			setScanState({ status: "success", result });
		} catch (error) {
			setScanState({
				status: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

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
						<span style={styles.blueprintPill}>
							{activeScreen.id === "repositories"
								? "local machine"
								: "typescript-standards"}
						</span>
						<span style={statusStyle(activeScreen.status)}>
							{statusLabels[activeScreen.status]}
						</span>
					</div>
				</section>

				<section
					style={styles.metricGrid}
					aria-label={`${activeScreen.label} status`}
				>
					{activeMetrics.map((metric) => (
						<div key={metric.label} style={styles.metricTile}>
							<div style={styles.metricLabel}>{metric.label}</div>
							<div style={metricValueStyle(metric.tone)}>{metric.value}</div>
						</div>
					))}
				</section>

				{activeScreen.id === "repositories" ? (
					<RepositoriesSurface
						rootInput={rootInput}
						rootPreferences={rootPreferences}
						scanState={scanState}
						overviewRows={repositoriesOverview.rows}
						onAddWorkspaceRoot={addWorkspaceRoot}
						onRemoveWorkspaceRoot={removeWorkspaceRoot}
						onRootInputChange={setRootInput}
						onRunScan={runScan}
						onToggleGlobalAgentFolders={toggleGlobalAgentFolders}
					/>
				) : (
					<section style={styles.workSurface}>
						<div style={styles.surfaceHeader}>
							<div>
								<div style={styles.surfaceTitle}>{activeScreen.label}</div>
								<div style={styles.surfaceSubtitle}>
									TypeScript owns drift classification. Rust owns local
									mechanics.
								</div>
							</div>
							<div style={styles.actionRow}>
								{activeScreen.actions.map((action) => (
									<button
										key={action}
										type="button"
										style={styles.commandButton}
									>
										{action}
									</button>
								))}
							</div>
						</div>

						<div style={styles.emptyState}>
							<div style={styles.emptyTitle}>
								Ready for the local drift loop
							</div>
							<div style={styles.emptyText}>
								The next slice wires scan results from repositories into this
								workspace.
							</div>
						</div>
					</section>
				)}
			</main>

			<footer style={styles.statusBar}>
				<span>Roots: {rootPreferences.workspaceRoots.length} selected</span>
				<span>Scan: {scanStatusLabel(scanState)}</span>
				<span>Local engine: {props.localEngine ? "ready" : "missing"}</span>
				<span>Repos: {repositoriesOverview.repoCount}</span>
			</footer>
		</div>
	);
}

type RepositoriesSurfaceProps = {
	rootInput: string;
	rootPreferences: RootPreferences;
	scanState: ScanState;
	overviewRows: readonly RepoOverviewRow[];
	onAddWorkspaceRoot: () => void;
	onRemoveWorkspaceRoot: (root: string) => void;
	onRootInputChange: (value: string) => void;
	onRunScan: () => void;
	onToggleGlobalAgentFolders: () => void;
};

function RepositoriesSurface(props: RepositoriesSurfaceProps): ReactElement {
	const isScanning = props.scanState.status === "scanning";
	const scannedRoots: readonly ScannedRoot[] =
		props.scanState.status === "success" ? props.scanState.result.roots : [];
	const warnings =
		props.scanState.status === "success" ? props.scanState.result.warnings : [];

	return (
		<section style={styles.workSurface}>
			<div style={styles.surfaceHeader}>
				<div>
					<div style={styles.surfaceTitle}>Repositories</div>
					<div style={styles.surfaceSubtitle}>
						TypeScript owns drift classification. Rust owns local mechanics.
					</div>
				</div>
				<button
					type="button"
					style={styles.primaryButton}
					onClick={props.onRunScan}
					disabled={isScanning}
				>
					{isScanning ? "Scanning" : "Run scan"}
				</button>
			</div>

			<div style={styles.repositoryBody}>
				<div style={styles.rootPanel}>
					<div style={styles.rootInputRow}>
						<input
							type="text"
							value={props.rootInput}
							onChange={(event) =>
								props.onRootInputChange(event.currentTarget.value)
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									props.onAddWorkspaceRoot();
								}
							}}
							placeholder="~/Code"
							style={styles.rootInput}
						/>
						<button
							type="button"
							style={styles.commandButton}
							onClick={props.onAddWorkspaceRoot}
						>
							Add
						</button>
					</div>

					<label style={styles.checkboxRow}>
						<input
							type="checkbox"
							checked={props.rootPreferences.includeGlobalAgentFolders}
							onChange={props.onToggleGlobalAgentFolders}
						/>
						<span>Include global agent folders</span>
					</label>

					<div style={styles.selectedRoots}>
						{props.rootPreferences.workspaceRoots.length === 0 ? (
							<span style={styles.mutedText}>No workspace roots selected.</span>
						) : (
							props.rootPreferences.workspaceRoots.map((root) => (
								<span key={root} style={styles.rootChip}>
									<span style={styles.rootChipText}>{root}</span>
									<button
										type="button"
										style={styles.removeButton}
										onClick={() => props.onRemoveWorkspaceRoot(root)}
										aria-label={`Remove ${root}`}
									>
										x
									</button>
								</span>
							))
						)}
					</div>
				</div>

				{props.scanState.status === "error" ? (
					<div style={styles.warningPanel}>{props.scanState.message}</div>
				) : null}

				{scannedRoots.length > 0 ? (
					<div style={styles.rootStatusRow}>
						{scannedRoots.map((root) => (
							<span
								key={`${root.input}:${root.normalizedPath ?? ""}`}
								style={styles.rootStatusPill}
							>
								{root.input}: {root.status}
							</span>
						))}
					</div>
				) : null}

				{warnings.length > 0 ? (
					<div style={styles.warningPanel}>
						{warnings.map((warning) => (
							<div key={`${warning.root}:${warning.message}`}>
								{warning.root}: {warning.message}
							</div>
						))}
					</div>
				) : null}

				{props.overviewRows.length > 0 ? (
					<table style={styles.repoTable}>
						<thead>
							<tr>
								<th style={styles.tableHeader}>Repo</th>
								<th style={styles.tableHeader}>Identity</th>
								<th style={styles.tableHeader}>Path</th>
								<th style={styles.tableHeaderNumeric}>Skills</th>
								<th style={styles.tableHeaderNumeric}>Managed</th>
								<th style={styles.tableHeaderNumeric}>TypeScript Standards</th>
								<th style={styles.tableHeader}>Lockfile</th>
							</tr>
						</thead>
						<tbody>
							{props.overviewRows.map((row) => (
								<tr key={row.repoRootPath}>
									<td style={styles.tableCellStrong}>{row.displayName}</td>
									<td style={styles.tableCell}>{row.identity}</td>
									<td style={styles.tableCellPath}>{row.repoRootPath}</td>
									<td style={styles.tableCellNumeric}>
										{row.skillContextCount}
									</td>
									<td style={styles.tableCellNumeric}>{row.managedCount}</td>
									<td style={styles.tableCellNumeric}>
										{row.typescriptStandardsCount}
									</td>
									<td style={styles.tableCell}>
										{row.hasRudelLockfile ? "yes" : "no"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<div style={styles.emptyState}>
						<div style={styles.emptyTitle}>
							{props.scanState.status === "success"
								? "No Git repositories found"
								: "Choose roots to scan"}
						</div>
						<div style={styles.emptyText}>
							Rudel will show Git repos under the selected roots and summarize
							where skill/context files exist.
						</div>
					</div>
				)}
			</div>
		</section>
	);
}

function repositoryMetrics(
	rootPreferences: RootPreferences,
	overview: RepositoriesOverview,
): readonly ScreenMetric[] {
	return [
		{
			label: "Selected roots",
			value: rootPreferences.workspaceRoots.length.toString(),
			tone: rootPreferences.workspaceRoots.length === 0 ? "warn" : "good",
		},
		{
			label: "Git repos",
			value: overview.repoCount.toString(),
			tone: "neutral",
		},
		{
			label: "Skill files",
			value: overview.skillContextCount.toString(),
			tone: "neutral",
		},
		{
			label: "TypeScript Standards",
			value: overview.typescriptStandardsCount.toString(),
			tone: overview.typescriptStandardsCount > 0 ? "good" : "neutral",
		},
		{
			label: "Global files",
			value: overview.globalArtifactCount.toString(),
			tone: "neutral",
		},
		{
			label: "Warnings",
			value: overview.warningCount.toString(),
			tone: overview.warningCount > 0 ? "warn" : "neutral",
		},
	];
}

function scanStatusLabel(scanState: ScanState): string {
	switch (scanState.status) {
		case "idle":
			return "idle";
		case "scanning":
			return "scanning";
		case "success":
			return "complete";
		case "error":
			return "error";
	}
}

function readRootPreferences(): RootPreferences {
	if (typeof window === "undefined") {
		return defaultRootPreferences;
	}

	try {
		const raw = window.localStorage.getItem(rootPreferencesStorageKey);
		if (!raw) return defaultRootPreferences;
		const parsed: unknown = JSON.parse(raw);
		return rootPreferencesFromUnknown(parsed);
	} catch {
		return defaultRootPreferences;
	}
}

function writeRootPreferences(preferences: RootPreferences) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			rootPreferencesStorageKey,
			JSON.stringify(preferences),
		);
	} catch {
		return;
	}
}

function rootPreferencesFromUnknown(value: unknown): RootPreferences {
	if (!isObjectRecord(value)) {
		return defaultRootPreferences;
	}

	return {
		version: 1,
		workspaceRoots: Array.isArray(value.workspaceRoots)
			? value.workspaceRoots.filter(isString)
			: [],
		includeGlobalAgentFolders: value.includeGlobalAgentFolders === true,
	};
}

function isObjectRecord(
	value: unknown,
): value is { readonly [key: string]: unknown } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
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
	primaryButton: {
		minHeight: 36,
		borderRadius: 8,
		border: "1px solid #23342d",
		background: "#24352d",
		color: "#ffffff",
		padding: "0 14px",
		font: "inherit",
		fontSize: 12,
		fontWeight: 750,
		cursor: "pointer",
	} satisfies CSSProperties,
	repositoryBody: {
		padding: 16,
		display: "flex",
		flexDirection: "column",
		gap: 14,
	} satisfies CSSProperties,
	rootPanel: {
		borderRadius: 8,
		border: "1px solid #ece8de",
		background: "#fbfaf7",
		padding: 14,
		display: "flex",
		flexDirection: "column",
		gap: 12,
	} satisfies CSSProperties,
	rootInputRow: {
		display: "grid",
		gridTemplateColumns: "minmax(0, 1fr) auto",
		gap: 8,
	} satisfies CSSProperties,
	rootInput: {
		minHeight: 36,
		borderRadius: 8,
		border: "1px solid #d7d2c5",
		background: "#ffffff",
		padding: "0 10px",
		font: "inherit",
		fontSize: 13,
		color: "#1e2421",
	} satisfies CSSProperties,
	checkboxRow: {
		minHeight: 28,
		display: "inline-flex",
		alignItems: "center",
		gap: 8,
		color: "#39443d",
		fontSize: 13,
		fontWeight: 650,
	} satisfies CSSProperties,
	selectedRoots: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
	} satisfies CSSProperties,
	rootChip: {
		minHeight: 30,
		display: "inline-flex",
		alignItems: "center",
		gap: 8,
		borderRadius: 8,
		border: "1px solid #d7d2c5",
		background: "#ffffff",
		padding: "0 6px 0 10px",
		maxWidth: "100%",
	} satisfies CSSProperties,
	rootChipText: {
		fontSize: 12,
		color: "#39443d",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	removeButton: {
		width: 22,
		height: 22,
		borderRadius: 8,
		border: "1px solid transparent",
		background: "transparent",
		color: "#68736c",
		cursor: "pointer",
		font: "inherit",
		fontSize: 12,
		fontWeight: 800,
	} satisfies CSSProperties,
	mutedText: {
		color: "#68736c",
		fontSize: 13,
	} satisfies CSSProperties,
	warningPanel: {
		borderRadius: 8,
		border: "1px solid #ecdba6",
		background: "#fff8df",
		color: "#6d5200",
		padding: 12,
		fontSize: 12,
		lineHeight: 1.5,
	} satisfies CSSProperties,
	rootStatusRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
	} satisfies CSSProperties,
	rootStatusPill: {
		minHeight: 26,
		display: "inline-flex",
		alignItems: "center",
		borderRadius: 8,
		border: "1px solid #d7d2c5",
		background: "#ffffff",
		color: "#39443d",
		padding: "0 8px",
		fontSize: 12,
	} satisfies CSSProperties,
	repoTable: {
		width: "100%",
		borderCollapse: "collapse",
		border: "1px solid #ece8de",
		borderRadius: 8,
		overflow: "hidden",
		fontSize: 12,
	} satisfies CSSProperties,
	tableHeader: {
		background: "#f3f1ea",
		borderBottom: "1px solid #dedbd2",
		color: "#68736c",
		fontWeight: 750,
		padding: "10px 12px",
		textAlign: "left",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	tableHeaderNumeric: {
		background: "#f3f1ea",
		borderBottom: "1px solid #dedbd2",
		color: "#68736c",
		fontWeight: 750,
		padding: "10px 12px",
		textAlign: "right",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	tableCell: {
		borderBottom: "1px solid #f0ece3",
		color: "#39443d",
		padding: "10px 12px",
		verticalAlign: "top",
	} satisfies CSSProperties,
	tableCellStrong: {
		borderBottom: "1px solid #f0ece3",
		color: "#1e2421",
		fontWeight: 750,
		padding: "10px 12px",
		verticalAlign: "top",
	} satisfies CSSProperties,
	tableCellPath: {
		borderBottom: "1px solid #f0ece3",
		color: "#68736c",
		padding: "10px 12px",
		verticalAlign: "top",
		maxWidth: 360,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	tableCellNumeric: {
		borderBottom: "1px solid #f0ece3",
		color: "#39443d",
		padding: "10px 12px",
		textAlign: "right",
		verticalAlign: "top",
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
