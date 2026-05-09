import type {
	MachineScanResult,
	ScannedRoot,
	ScanRootSuggestion,
	ScanWarning,
} from "@rudel/skill-schema";
import {
	type CSSProperties,
	type ReactElement,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	buildRepositoriesOverview,
	type RepoOverviewRow,
	type RepositoriesOverview,
} from "./features/repositories-overview/index.js";
import type { LocalEngine, ScanSelection } from "./ports/local-engine.js";

type RepoScanEngine = Pick<LocalEngine, "suggestScanRoots" | "scanMachine">;

type RootPreferences = {
	version: 3;
	workspaceRoots: string[];
};

type ScanState =
	| { status: "idle" }
	| { status: "scanning" }
	| { status: "success"; result: MachineScanResult }
	| { status: "error"; message: string };

type GalleryMetric = {
	label: string;
	value: string;
	tone: "neutral" | "good" | "warn";
};

export type RudelDesktopAppProps = {
	localEngine: RepoScanEngine;
	pickWorkspaceRoots?: () => Promise<readonly string[]>;
};

const rootPreferencesStorageKey = "rudel:repo-overview-preferences:v2";

const repoOnlyScanSelection: ScanSelection = {
	profiles: {
		agentSkills: false,
		cursorRules: false,
		repoContext: false,
		globalAgentRoots: false,
	},
	includeGlobs: [],
	excludedPaths: [],
};

const defaultRootPreferences: RootPreferences = {
	version: 3,
	workspaceRoots: [],
};

export function RudelDesktopApp(props: RudelDesktopAppProps): ReactElement {
	const [rootPreferences, setRootPreferences] =
		useState<RootPreferences>(readRootPreferences);
	const [rootInput, setRootInput] = useState("");
	const [rootSuggestions, setRootSuggestions] = useState<
		readonly ScanRootSuggestion[]
	>([]);
	const [scanState, setScanState] = useState<ScanState>({ status: "idle" });
	const scanResult =
		scanState.status === "success" ? scanState.result : undefined;
	const repositoriesOverview = useMemo(
		() => buildRepositoriesOverview(scanResult),
		[scanResult],
	);
	const metrics = repositoryMetrics(rootPreferences, repositoriesOverview);

	useEffect(() => {
		let cancelled = false;
		props.localEngine
			.suggestScanRoots()
			.then((result) => {
				if (!cancelled) {
					setRootSuggestions(result.suggestions);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setRootSuggestions([]);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [props.localEngine]);

	function updateRootPreferences(nextPreferences: RootPreferences) {
		setRootPreferences(nextPreferences);
		writeRootPreferences(nextPreferences);
	}

	function addWorkspaceRoot(root = rootInput) {
		const normalizedRoot = root.trim();
		if (!normalizedRoot) return;
		if (rootPreferences.workspaceRoots.includes(normalizedRoot)) {
			setRootInput("");
			return;
		}
		updateRootPreferences({
			version: 3,
			workspaceRoots: [...rootPreferences.workspaceRoots, normalizedRoot],
		});
		setRootInput("");
	}

	async function pickWorkspaceRoots() {
		if (!props.pickWorkspaceRoots) return;
		const pickedRoots = await props.pickWorkspaceRoots();
		const nextRoots = [
			...rootPreferences.workspaceRoots,
			...pickedRoots.filter(
				(root) => !rootPreferences.workspaceRoots.includes(root),
			),
		];
		updateRootPreferences({
			version: 3,
			workspaceRoots: nextRoots,
		});
	}

	function removeWorkspaceRoot(root: string) {
		updateRootPreferences({
			version: 3,
			workspaceRoots: rootPreferences.workspaceRoots.filter(
				(workspaceRoot) => workspaceRoot !== root,
			),
		});
	}

	async function runScan() {
		setScanState({ status: "scanning" });
		try {
			const result = await props.localEngine.scanMachine({
				roots: rootPreferences.workspaceRoots,
				selection: repoOnlyScanSelection,
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
			<header style={styles.header}>
				<div style={styles.brandRow}>
					<div style={styles.brandMark}>R</div>
					<div>
						<div style={styles.brandTitle}>Rudel Desktop</div>
						<div style={styles.brandSubtitle}>Local repository scan</div>
					</div>
				</div>
				<button
					type="button"
					style={primaryButtonStyle(
						scanState.status === "scanning" ||
							rootPreferences.workspaceRoots.length === 0,
					)}
					onClick={runScan}
					disabled={
						scanState.status === "scanning" ||
						rootPreferences.workspaceRoots.length === 0
					}
				>
					{scanState.status === "scanning" ? "Scanning" : "Scan repos"}
				</button>
			</header>

			<main style={styles.main}>
				<section style={styles.hero}>
					<div>
						<div style={styles.kicker}>Repository Gallery</div>
						<h1 style={styles.title}>Code repos on this machine</h1>
					</div>
					<p style={styles.introText}>
						Choose folders to scan. Rudel will find Git repositories under those
						roots and show them as a local gallery.
					</p>
				</section>

				<RootPicker
					rootInput={rootInput}
					rootPreferences={rootPreferences}
					rootSuggestions={rootSuggestions}
					onAddWorkspaceRoot={addWorkspaceRoot}
					onPickWorkspaceRoots={
						props.pickWorkspaceRoots ? pickWorkspaceRoots : undefined
					}
					onRemoveWorkspaceRoot={removeWorkspaceRoot}
					onRootInputChange={setRootInput}
				/>

				<section style={styles.metricGrid} aria-label="Repository scan status">
					{metrics.map((metric) => (
						<div key={metric.label} style={styles.metricTile}>
							<div style={styles.metricLabel}>{metric.label}</div>
							<div style={metricValueStyle(metric.tone)}>{metric.value}</div>
						</div>
					))}
				</section>

				<ScanMessages scanState={scanState} />

				<RepositoryGallery
					rows={repositoriesOverview.rows}
					scanState={scanState}
				/>
			</main>

			<footer style={styles.statusBar}>
				<span>Roots: {rootPreferences.workspaceRoots.length}</span>
				<span>Scan: {scanStatusLabel(scanState)}</span>
				<span>Repos: {repositoriesOverview.repoCount}</span>
			</footer>
		</div>
	);
}

type RootPickerProps = {
	rootInput: string;
	rootPreferences: RootPreferences;
	rootSuggestions: readonly ScanRootSuggestion[];
	onAddWorkspaceRoot: (root?: string) => void;
	onPickWorkspaceRoots: (() => void) | undefined;
	onRemoveWorkspaceRoot: (root: string) => void;
	onRootInputChange: (value: string) => void;
};

function RootPicker(props: RootPickerProps): ReactElement {
	return (
		<section style={styles.rootPanel} aria-label="Scan roots">
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
					style={styles.secondaryButton}
					onClick={() => props.onAddWorkspaceRoot()}
				>
					Add
				</button>
			</div>

			<div style={styles.suggestionRow}>
				{props.onPickWorkspaceRoots ? (
					<button
						type="button"
						style={styles.secondaryButton}
						onClick={props.onPickWorkspaceRoots}
					>
						Choose folder
					</button>
				) : null}
				{props.rootSuggestions.map((suggestion) => {
					const isSelected = props.rootPreferences.workspaceRoots.includes(
						suggestion.path,
					);
					return (
						<button
							key={suggestion.normalizedPath}
							type="button"
							style={secondaryButtonStyle(isSelected)}
							onClick={() => props.onAddWorkspaceRoot(suggestion.path)}
						>
							{suggestion.label}
						</button>
					);
				})}
			</div>

			<div style={styles.selectedRoots}>
				{props.rootPreferences.workspaceRoots.length === 0 ? (
					<span style={styles.mutedText}>No scan roots selected.</span>
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
		</section>
	);
}

type ScanMessagesProps = {
	scanState: ScanState;
};

function ScanMessages(props: ScanMessagesProps): ReactElement | null {
	if (props.scanState.status === "error") {
		return <div style={styles.warningPanel}>{props.scanState.message}</div>;
	}

	if (props.scanState.status !== "success") {
		return null;
	}

	const roots = props.scanState.result.roots;
	const warnings = props.scanState.result.warnings;
	if (roots.length === 0 && warnings.length === 0) {
		return null;
	}

	return (
		<section style={styles.scanMessages} aria-label="Scan messages">
			{roots.length > 0 ? <ScannedRoots roots={roots} /> : null}
			{warnings.length > 0 ? <Warnings warnings={warnings} /> : null}
		</section>
	);
}

type ScannedRootsProps = {
	roots: readonly ScannedRoot[];
};

function ScannedRoots(props: ScannedRootsProps): ReactElement {
	return (
		<div style={styles.rootStatusRow}>
			{props.roots.map((root) => (
				<span
					key={`${root.input}:${root.normalizedPath ?? ""}`}
					style={styles.rootStatusPill}
				>
					{root.input}: {root.status}
				</span>
			))}
		</div>
	);
}

type WarningsProps = {
	warnings: readonly ScanWarning[];
};

function Warnings(props: WarningsProps): ReactElement {
	return (
		<div style={styles.warningPanel}>
			{props.warnings.map((warning) => (
				<div key={`${warning.root}:${warning.message}`}>
					{warning.root}: {warning.message}
				</div>
			))}
		</div>
	);
}

type RepositoryGalleryProps = {
	rows: readonly RepoOverviewRow[];
	scanState: ScanState;
};

function RepositoryGallery(props: RepositoryGalleryProps): ReactElement {
	if (props.rows.length === 0) {
		return (
			<section style={styles.emptyState}>
				<div style={styles.emptyTitle}>{emptyStateTitle(props.scanState)}</div>
				<div style={styles.emptyText}>{emptyStateText(props.scanState)}</div>
			</section>
		);
	}

	return (
		<section style={styles.gallery} aria-label="Repository gallery">
			{props.rows.map((row) => (
				<RepositoryCard key={row.id} row={row} />
			))}
		</section>
	);
}

type RepositoryCardProps = {
	row: RepoOverviewRow;
};

function RepositoryCard(props: RepositoryCardProps): ReactElement {
	const row = props.row;
	return (
		<article style={styles.repoCard}>
			<div style={styles.repoCardHeader}>
				<div style={styles.repoTitleGroup}>
					<div style={styles.repoTitle}>{row.displayName}</div>
					<div style={styles.repoIdentity}>{row.identity}</div>
				</div>
			</div>

			<dl style={styles.repoFacts}>
				<div style={styles.repoFact}>
					<dt style={styles.repoFactLabel}>Branch</dt>
					<dd style={styles.repoFactValue}>{row.branchName}</dd>
				</div>
				<div style={styles.repoFact}>
					<dt style={styles.repoFactLabel}>View</dt>
					<dd style={styles.repoFactValue}>
						{row.rowKind === "group" ? "Repo group" : "Worktree"}
					</dd>
				</div>
				<div style={styles.repoFact}>
					<dt style={styles.repoFactLabel}>Worktrees</dt>
					<dd style={styles.repoFactValue}>{row.worktreeCount}</dd>
				</div>
			</dl>

			<div style={styles.repoPath}>{row.repoRootPath}</div>
		</article>
	);
}

function repositoryMetrics(
	rootPreferences: RootPreferences,
	overview: RepositoriesOverview,
): readonly GalleryMetric[] {
	return [
		{
			label: "Roots",
			value: rootPreferences.workspaceRoots.length.toString(),
			tone: rootPreferences.workspaceRoots.length === 0 ? "warn" : "good",
		},
		{
			label: "Repositories",
			value: overview.repoCount.toString(),
			tone: "neutral",
		},
		{
			label: "Worktrees",
			value: overview.worktreeCount.toString(),
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

function emptyStateTitle(scanState: ScanState): string {
	switch (scanState.status) {
		case "success":
			return "No Git repositories found";
		case "scanning":
			return "Scanning selected roots";
		case "error":
			return "Scan needs attention";
		case "idle":
			return "Choose roots to scan";
	}
}

function emptyStateText(scanState: ScanState): string {
	switch (scanState.status) {
		case "success":
			return "Try a broader folder, such as your main code directory or a workspace folder.";
		case "scanning":
			return "Rudel is walking the selected folders and grouping discovered Git repositories.";
		case "error":
			return "Fix the scan error above, then run the repository scan again.";
		case "idle":
			return "Add one or more folders, then scan to build the repository gallery.";
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
		version: 3,
		workspaceRoots: Array.isArray(value.workspaceRoots)
			? value.workspaceRoots.filter(isString)
			: [],
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

function primaryButtonStyle(disabled: boolean): CSSProperties {
	return {
		...styles.primaryButton,
		...(disabled ? styles.primaryButtonDisabled : {}),
	};
}

function secondaryButtonStyle(active: boolean): CSSProperties {
	return {
		...styles.secondaryButton,
		...(active ? styles.secondaryButtonActive : {}),
	};
}

function metricValueStyle(tone: GalleryMetric["tone"]): CSSProperties {
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
		background: "#f7f7f4",
		color: "#1c241f",
		display: "grid",
		gridTemplateRows: "auto minmax(0, 1fr) 40px",
		fontFamily:
			'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
	} satisfies CSSProperties,
	header: {
		minHeight: 68,
		borderBottom: "1px solid #deded7",
		background: "#ffffff",
		padding: "0 24px",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
	} satisfies CSSProperties,
	brandRow: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		minWidth: 0,
	} satisfies CSSProperties,
	brandMark: {
		width: 36,
		height: 36,
		borderRadius: 8,
		display: "grid",
		placeItems: "center",
		background: "#20342b",
		color: "#ffffff",
		fontWeight: 750,
		flex: "0 0 auto",
	} satisfies CSSProperties,
	brandTitle: {
		fontSize: 15,
		fontWeight: 750,
		lineHeight: 1.2,
	} satisfies CSSProperties,
	brandSubtitle: {
		marginTop: 2,
		color: "#69746d",
		fontSize: 12,
	} satisfies CSSProperties,
	main: {
		minWidth: 0,
		padding: 24,
		display: "flex",
		flexDirection: "column",
		gap: 16,
		overflow: "auto",
	} satisfies CSSProperties,
	hero: {
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 24,
	} satisfies CSSProperties,
	kicker: {
		color: "#69746d",
		fontSize: 12,
		fontWeight: 750,
		textTransform: "uppercase",
		letterSpacing: 0,
	} satisfies CSSProperties,
	title: {
		margin: "6px 0 0",
		fontSize: 30,
		lineHeight: 1.1,
		letterSpacing: 0,
	} satisfies CSSProperties,
	introText: {
		maxWidth: 520,
		margin: 0,
		color: "#4f5b54",
		fontSize: 14,
		lineHeight: 1.5,
	} satisfies CSSProperties,
	rootPanel: {
		borderRadius: 8,
		border: "1px solid #deded7",
		background: "#ffffff",
		padding: 16,
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
		minHeight: 38,
		borderRadius: 8,
		border: "1px solid #d3d8d3",
		background: "#ffffff",
		padding: "0 10px",
		font: "inherit",
		fontSize: 13,
		color: "#1c241f",
	} satisfies CSSProperties,
	suggestionRow: {
		display: "flex",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
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
		border: "1px solid #d3d8d3",
		background: "#f8faf8",
		padding: "0 6px 0 10px",
		maxWidth: "100%",
	} satisfies CSSProperties,
	rootChipText: {
		fontSize: 12,
		color: "#39453d",
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
		color: "#69746d",
		cursor: "pointer",
		font: "inherit",
		fontSize: 12,
		fontWeight: 800,
	} satisfies CSSProperties,
	primaryButton: {
		minHeight: 38,
		borderRadius: 8,
		border: "1px solid #20342b",
		background: "#20342b",
		color: "#ffffff",
		padding: "0 14px",
		font: "inherit",
		fontSize: 13,
		fontWeight: 750,
		cursor: "pointer",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	primaryButtonDisabled: {
		opacity: 0.45,
		cursor: "not-allowed",
	} satisfies CSSProperties,
	secondaryButton: {
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
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	secondaryButtonActive: {
		borderColor: "#95ad9a",
		background: "#eaf3eb",
	} satisfies CSSProperties,
	metricGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
		gap: 10,
	} satisfies CSSProperties,
	metricTile: {
		minHeight: 76,
		borderRadius: 8,
		border: "1px solid #deded7",
		background: "#ffffff",
		padding: 12,
		display: "flex",
		flexDirection: "column",
		justifyContent: "space-between",
	} satisfies CSSProperties,
	metricLabel: {
		color: "#69746d",
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
		color: "#24703a",
	} satisfies CSSProperties,
	metricNeutral: {
		color: "#1c241f",
	} satisfies CSSProperties,
	metricWarn: {
		color: "#8a5a00",
	} satisfies CSSProperties,
	scanMessages: {
		display: "flex",
		flexDirection: "column",
		gap: 8,
	} satisfies CSSProperties,
	rootStatusRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: 8,
	} satisfies CSSProperties,
	rootStatusPill: {
		minHeight: 28,
		display: "inline-flex",
		alignItems: "center",
		borderRadius: 8,
		border: "1px solid #d3d8d3",
		background: "#ffffff",
		color: "#39453d",
		padding: "0 8px",
		fontSize: 12,
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
	gallery: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
		gap: 12,
	} satisfies CSSProperties,
	repoCard: {
		minHeight: 184,
		borderRadius: 8,
		border: "1px solid #deded7",
		background: "#ffffff",
		padding: 16,
		display: "flex",
		flexDirection: "column",
		gap: 14,
	} satisfies CSSProperties,
	repoCardHeader: {
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	} satisfies CSSProperties,
	repoTitleGroup: {
		minWidth: 0,
	} satisfies CSSProperties,
	repoTitle: {
		fontSize: 17,
		fontWeight: 750,
		lineHeight: 1.25,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoIdentity: {
		marginTop: 4,
		color: "#69746d",
		fontSize: 12,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoFacts: {
		margin: 0,
		display: "grid",
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
		gap: 8,
	} satisfies CSSProperties,
	repoFact: {
		minWidth: 0,
		borderTop: "1px solid #eeeee8",
		paddingTop: 10,
	} satisfies CSSProperties,
	repoFactLabel: {
		color: "#69746d",
		fontSize: 11,
		fontWeight: 700,
	} satisfies CSSProperties,
	repoFactValue: {
		margin: "4px 0 0",
		color: "#1c241f",
		fontSize: 13,
		fontWeight: 700,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoPath: {
		marginTop: "auto",
		borderRadius: 8,
		background: "#f4f5f1",
		color: "#4f5b54",
		padding: "8px 10px",
		fontSize: 12,
		lineHeight: 1.4,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	emptyState: {
		minHeight: 280,
		borderRadius: 8,
		border: "1px solid #deded7",
		background: "#ffffff",
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
		color: "#69746d",
		fontSize: 13,
		lineHeight: 1.5,
	} satisfies CSSProperties,
	mutedText: {
		color: "#69746d",
		fontSize: 13,
	} satisfies CSSProperties,
	statusBar: {
		borderTop: "1px solid #deded7",
		background: "#ffffff",
		display: "flex",
		alignItems: "center",
		gap: 18,
		padding: "0 24px",
		color: "#69746d",
		fontSize: 12,
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
