import type {
	LockfileStatus,
	MachineScanResult,
	SkillArtifact,
} from "@rudel/skill-schema";
import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Checkbox } from "./components/ui/checkbox.js";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./components/ui/table.js";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "./components/ui/tabs.js";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./components/ui/tooltip.js";
import {
	buildRepositoriesOverview,
	type RepoOverviewRow,
} from "./features/repositories-overview/index.js";
import type {
	LocalEngine,
	ScanSelection,
	SkillInventoryStreamEvent,
} from "./ports/local-engine.js";

type RepoScanEngine = Pick<
	LocalEngine,
	"suggestScanRoots" | "scanMachine" | "streamSkillInventory"
>;

type AppView = "onboarding" | "dashboard";
type DashboardTab = "repos" | "skills";

type DashboardPage =
	| { screen: "overview" }
	| { screen: "skill"; skillId: string }
	| { screen: "repo"; repoId: string };

type SkillScanState =
	| { status: "loading"; skills: readonly DetectedSkillRow[] }
	| { status: "success"; skills: readonly DetectedSkillRow[] }
	| { status: "error"; message: string; skills: readonly DetectedSkillRow[] };

type RepoScanState =
	| { status: "loading"; rows: readonly RepoOverviewRow[] }
	| { status: "success"; rows: readonly RepoOverviewRow[] }
	| { status: "error"; message: string; rows: readonly RepoOverviewRow[] };

type DetectedSkillRow = {
	id: string;
	name: string;
	sourceLabel: string;
	sourcePrimaryLabel: string;
	additionalSourceCount: number;
	emoji: string;
	background: string;
	sources: readonly DetectedSkillSource[];
	content: string;
	copyCount: number;
};

type DetectedSkillSource = {
	key: string;
	label: string;
	content: string;
	priority: number;
};

export type RepoSkillIconItem = {
	id: string;
	name: string;
	emoji: string;
	background: string;
};

type RepoSkillInventoryStatus = LockfileStatus | "detected_only";

type RepoSkillInventorySource =
	| "team_blueprint"
	| "managed_section"
	| "local_skill";

type RepoSkillInventoryAction =
	| "add_section"
	| "adopt_ignore"
	| "none"
	| "review_drift"
	| "update"
	| "view";

export type RepoSkillInventoryRow = {
	id: string;
	name: string;
	status: RepoSkillInventoryStatus;
	statusLabel: string;
	source: RepoSkillInventorySource;
	sourceLabel: string;
	action: RepoSkillInventoryAction;
	targetLabels: readonly string[];
	skillId: string | undefined;
	overlayHash: string | undefined;
	hasOverlay: boolean;
	copyCount: number;
};

export type SkillRolloutFilter = "all" | "drift" | "missing" | "unmanaged";

type RudelTableColumn = {
	id: string;
	label: string;
	textAlign?: "left" | "center" | "right";
	width?: number;
	hardcoded?: boolean;
};

const skillRolloutFilterOptions = [
	{ filter: "all", label: "All" },
	{ filter: "drift", label: "Drift" },
	{ filter: "missing", label: "Missing" },
	{ filter: "unmanaged", label: "Unmanaged" },
] as const satisfies readonly {
	filter: SkillRolloutFilter;
	label: string;
}[];

const repoSkillInventoryColumns = [
	{ id: "skill", label: "Skill / context" },
	{ id: "status", label: "Status", width: 132 },
	{ id: "source", label: "Source", width: 152 },
	{ id: "action", label: "Action", textAlign: "right", width: 168 },
] as const satisfies readonly RudelTableColumn[];

const skillRolloutTableColumns = [
	{ id: "repo", label: "Repo", hardcoded: true },
	{ id: "status", label: "Status", hardcoded: true, width: 132 },
	{ id: "targets", label: "Targets", hardcoded: true, width: 152 },
	{ id: "overlay", label: "Overlay", hardcoded: true, width: 132 },
	{
		id: "copies",
		label: "Copies",
		hardcoded: true,
		textAlign: "right",
		width: 90,
	},
	{
		id: "action",
		label: "Action",
		hardcoded: true,
		textAlign: "right",
		width: 168,
	},
] as const satisfies readonly RudelTableColumn[];

export type SkillRolloutRow = {
	id: string;
	repoName: string;
	repoIdentity: string;
	repoIsLocalOnly: boolean;
	status: RepoSkillInventoryStatus;
	statusLabel: string;
	targetLabel: string;
	overlayLabel: string;
	copyCount: number;
	action: RepoSkillInventoryAction;
};

export type RudelDesktopAppProps = {
	localEngine: RepoScanEngine;
	pickWorkspaceRoots?: () => Promise<readonly string[]>;
	windowChrome?: DesktopWindowChrome;
};

export type DesktopWindowChrome = {
	isFullscreen: boolean;
};

const onboardingSteps = [
	{
		title: "Hi there",
		description: "Let's set up Rudel.",
	},
	{
		title: "This place manages and improves your skills.",
		description:
			"Keep the instructions your agents rely on in one focused place.",
	},
	{
		title: "Skills found on this machine",
		description: "A first pass over the local skill folders.",
	},
	{
		title: "Select your main repos",
		description: "Choose the repositories you actively work in.",
	},
	{
		title: "Connect GitHub",
		description:
			"Linking comes later. For now this is only the shape of the step.",
	},
] as const;

const firstOnboardingStep = onboardingSteps[0];

const skillInventoryScanSelection: ScanSelection = {
	profiles: {
		agentSkills: true,
		cursorRules: true,
		repoContext: true,
		globalAgentRoots: true,
	},
	includeGlobs: [],
	excludedPaths: [],
};

const repositoryScanSelection: ScanSelection = {
	profiles: {
		agentSkills: false,
		cursorRules: false,
		repoContext: false,
		globalAgentRoots: false,
	},
	includeGlobs: [],
	excludedPaths: [],
};

const dashboardOverviewPage: DashboardPage = { screen: "overview" };

const titlebarHeight = 33;
const titlebarGap = 10;
const trafficLightControlSpaceWidth = 78;
const fullscreenTitlebarInset = 16;
const titlebarTextBottomInset = 4;
const trafficLightTitlebarTextBottomInset = titlebarTextBottomInset + 2;

export function RudelDesktopApp(props: RudelDesktopAppProps): ReactElement {
	const [appView, setAppView] = useState<AppView>("onboarding");
	const [dashboardPage, setDashboardPage] = useState<DashboardPage>(
		dashboardOverviewPage,
	);
	const [dashboardDefaultTab, setDashboardDefaultTab] =
		useState<DashboardTab>("repos");
	const [activeStepIndex, setActiveStepIndex] = useState(0);
	const [skillScanState, setSkillScanState] = useState<SkillScanState>({
		status: "loading",
		skills: [],
	});
	const [skillArtifacts, setSkillArtifacts] = useState<
		readonly SkillArtifact[]
	>([]);
	const [repoScanState, setRepoScanState] = useState<RepoScanState>({
		status: "loading",
		rows: [],
	});
	const [selectedRepoIds, setSelectedRepoIds] = useState<readonly string[]>([]);
	const activeStep = onboardingSteps[activeStepIndex] ?? firstOnboardingStep;
	const isLastStep = activeStepIndex === onboardingSteps.length - 1;

	const applySkillInventoryEvent = useCallback(
		(event: SkillInventoryStreamEvent) => {
			if (event.type === "skill") {
				setSkillArtifacts((currentArtifacts) =>
					upsertSkillArtifact(currentArtifacts, event.artifact),
				);
				setSkillScanState((currentState) => ({
					status: "loading",
					skills: upsertDetectedSkillRow(
						skillsFromScanState(currentState),
						event.artifact,
					),
				}));
				return;
			}

			if (event.type === "done") {
				setSkillArtifacts(event.result.artifacts);
				setSkillScanState({
					status: "success",
					skills: buildDetectedSkillRows(event.result),
				});
				return;
			}

			setSkillScanState((currentState) => ({
				status: "error",
				skills: skillsFromScanState(currentState),
				message: event.message,
			}));
		},
		[],
	);

	useEffect(() => {
		let cancelled = false;
		let cleanup: (() => void) | undefined;

		setSkillScanState({ status: "loading", skills: [] });
		setSkillArtifacts([]);

		async function startSkillInventoryStream() {
			try {
				const suggestions = await props.localEngine.suggestScanRoots();
				if (cancelled) {
					return;
				}

				const unlisten = await props.localEngine.streamSkillInventory(
					{
						roots: suggestions.suggestions.map((suggestion) => suggestion.path),
						selection: skillInventoryScanSelection,
					},
					(event) => {
						if (!cancelled) {
							applySkillInventoryEvent(event);
						}
					},
				);

				if (cancelled) {
					unlisten();
					return;
				}
				cleanup = unlisten;
			} catch (error) {
				if (!cancelled) {
					setSkillScanState({
						status: "error",
						skills: [],
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		void startSkillInventoryStream();

		return () => {
			cancelled = true;
			cleanup?.();
		};
	}, [applySkillInventoryEvent, props.localEngine]);

	useEffect(() => {
		let cancelled = false;
		setRepoScanState({ status: "loading", rows: [] });

		async function scanRepositories() {
			try {
				const suggestions = await props.localEngine.suggestScanRoots();
				if (cancelled) {
					return;
				}
				const result = await props.localEngine.scanMachine({
					roots: suggestions.suggestions.map((suggestion) => suggestion.path),
					selection: repositoryScanSelection,
				});
				if (cancelled) {
					return;
				}
				const rows = buildRepositoriesOverview(result).rows;
				setRepoScanState({ status: "success", rows });
				setSelectedRepoIds((currentRepoIds) =>
					currentRepoIds.filter((repoId) =>
						rows.some((row) => row.id === repoId),
					),
				);
			} catch (error) {
				if (!cancelled) {
					setRepoScanState({
						status: "error",
						rows: [],
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		void scanRepositories();

		return () => {
			cancelled = true;
		};
	}, [props.localEngine]);

	function advanceStep() {
		setActiveStepIndex((currentStepIndex) =>
			Math.min(currentStepIndex + 1, onboardingSteps.length - 1),
		);
	}

	function goBackStep() {
		setActiveStepIndex((currentStepIndex) => Math.max(currentStepIndex - 1, 0));
	}

	function toggleRepoSelection(repoId: string) {
		setSelectedRepoIds((currentRepoIds) =>
			currentRepoIds.includes(repoId)
				? currentRepoIds.filter((currentRepoId) => currentRepoId !== repoId)
				: [...currentRepoIds, repoId],
		);
	}

	function openSkillPage(skillId: string) {
		setDashboardDefaultTab("skills");
		setDashboardPage({ screen: "skill", skillId });
		setAppView("dashboard");
	}

	function openRepoPage(repoId: string) {
		setDashboardDefaultTab("repos");
		setDashboardPage({ screen: "repo", repoId });
		setAppView("dashboard");
	}

	function showMainOverview() {
		setDashboardDefaultTab("repos");
		setDashboardPage(dashboardOverviewPage);
	}

	function showReposOverview() {
		setDashboardDefaultTab("repos");
		setDashboardPage(dashboardOverviewPage);
	}

	function showSkillsOverview() {
		setDashboardDefaultTab("skills");
		setDashboardPage(dashboardOverviewPage);
	}

	if (appView === "dashboard") {
		const selectedRepoRows = repoScanState.rows.filter((row) =>
			selectedRepoIds.includes(row.id),
		);
		const dashboardRepoRows =
			selectedRepoRows.length > 0 ? selectedRepoRows : repoScanState.rows;

		return (
			<Dashboard
				defaultTab={dashboardDefaultTab}
				onOpenRepo={openRepoPage}
				onOpenSkill={openSkillPage}
				onShowMain={showMainOverview}
				onShowRepos={showReposOverview}
				onShowSkills={showSkillsOverview}
				page={dashboardPage}
				repoRows={dashboardRepoRows}
				repoScanState={repoScanState}
				skillRows={skillScanState.skills}
				skillArtifacts={skillArtifacts}
				skillScanState={skillScanState}
				windowChrome={props.windowChrome}
			/>
		);
	}

	return (
		<main style={styles.shell}>
			<ol style={styles.stepper} aria-label="Onboarding steps">
				{onboardingSteps.map((step, index) => {
					const isActive = index === activeStepIndex;
					const isComplete = index < activeStepIndex;
					return (
						<li
							key={step.title}
							style={stepStyle(isActive, isComplete)}
							aria-current={isActive ? "step" : undefined}
						>
							{index + 1}
						</li>
					);
				})}
			</ol>

			<section style={styles.panel} aria-labelledby="rudel-onboarding-title">
				<div style={styles.content}>
					<h1 id="rudel-onboarding-title" style={styles.title}>
						{activeStepIndex === 2 ? (
							<>
								<span style={styles.titleNumber}>
									{skillScanState.skills.length}
								</span>{" "}
								Skills found on this machine
							</>
						) : (
							activeStep.title
						)}
					</h1>
					<p style={styles.description}>{activeStep.description}</p>

					{activeStepIndex === 2 ? (
						<DetectedSkills
							onOpenSkill={openSkillPage}
							skillScanState={skillScanState}
						/>
					) : null}
					{activeStepIndex === 3 ? (
						<RepositorySelection
							repoScanState={repoScanState}
							selectedRepoIds={selectedRepoIds}
							onToggleRepo={toggleRepoSelection}
						/>
					) : null}
				</div>

				<div style={styles.footer}>
					<Button
						disabled={activeStepIndex === 0}
						onClick={goBackStep}
						variant="secondary"
					>
						Back
					</Button>
					<Button
						onClick={isLastStep ? () => setAppView("dashboard") : advanceStep}
					>
						{isLastStep ? "Continue with GitHub" : "Next"}
					</Button>
				</div>
			</section>
		</main>
	);
}

type DetectedSkillsProps = {
	onOpenSkill: (skillId: string) => void;
	skillScanState: SkillScanState;
};

type DashboardProps = {
	defaultTab: DashboardTab;
	onOpenRepo: (repoId: string) => void;
	onOpenSkill: (skillId: string) => void;
	onShowMain: () => void;
	onShowRepos: () => void;
	onShowSkills: () => void;
	page: DashboardPage;
	repoRows: readonly RepoOverviewRow[];
	repoScanState: RepoScanState;
	skillArtifacts: readonly SkillArtifact[];
	skillRows: readonly DetectedSkillRow[];
	skillScanState: SkillScanState;
	windowChrome: DesktopWindowChrome | undefined;
};

type DashboardBreadcrumbItem = {
	key: string;
	label: string;
	onSelect?: () => void;
};

function Dashboard(props: DashboardProps): ReactElement {
	const selectedSkill =
		props.page.screen === "skill"
			? skillRowForId(props.skillRows, props.page.skillId)
			: undefined;
	const selectedRepo =
		props.page.screen === "repo"
			? repoRowForId(props.repoRows, props.page.repoId)
			: undefined;
	const breadcrumbItems = dashboardBreadcrumbItems({
		onShowMain: props.onShowMain,
		onShowRepos: props.onShowRepos,
		onShowSkills: props.onShowSkills,
		selectedRepo,
		selectedSkill,
	});

	return (
		<main style={styles.dashboardShell}>
			<header
				style={buildDashboardTopBarStyle(props.windowChrome?.isFullscreen)}
			>
				<div
					data-tauri-drag-region
					style={buildTitlebarControlSpaceStyle(
						props.windowChrome?.isFullscreen,
					)}
				/>
				<div style={buildDashboardTitleStyle(props.windowChrome?.isFullscreen)}>
					{breadcrumbItems.length > 0 ? (
						<DashboardBreadcrumb items={breadcrumbItems} />
					) : (
						<span data-tauri-drag-region>Main</span>
					)}
				</div>
				<div data-tauri-drag-region style={styles.titlebarDragFill} />
			</header>

			<section style={styles.dashboardContent} aria-label="Main dashboard">
				{selectedSkill ? (
					<SkillDetailPage
						repoRows={props.repoRows}
						skill={selectedSkill}
						skillArtifacts={props.skillArtifacts}
					/>
				) : selectedRepo ? (
					<RepoDetailPage
						onOpenSkill={props.onOpenSkill}
						repo={selectedRepo}
						skillArtifacts={props.skillArtifacts}
						skillRows={props.skillRows}
						skillScanState={props.skillScanState}
					/>
				) : (
					<Tabs defaultValue={props.defaultTab}>
						<div style={styles.dashboardTabsBar}>
							<TabsList>
								<TabsTrigger value="repos">Repos</TabsTrigger>
								<TabsTrigger value="skills">Skills</TabsTrigger>
							</TabsList>
						</div>
						<TabsContent value="repos">
							<DashboardReposTable
								onOpenRepo={props.onOpenRepo}
								repoRows={props.repoRows}
								repoScanState={props.repoScanState}
								skillArtifacts={props.skillArtifacts}
							/>
						</TabsContent>
						<TabsContent value="skills">
							<DashboardSkillsTable
								onOpenSkill={props.onOpenSkill}
								skillRows={props.skillRows}
								skillScanState={props.skillScanState}
							/>
						</TabsContent>
					</Tabs>
				)}
			</section>
		</main>
	);
}

function buildDashboardTopBarStyle(isFullscreen = false): CSSProperties {
	return {
		...styles.dashboardTopBar,
		gap: isFullscreen ? 0 : titlebarGap,
		paddingLeft: isFullscreen ? fullscreenTitlebarInset : 0,
	};
}

function buildTitlebarControlSpaceStyle(isFullscreen = false): CSSProperties {
	return {
		...styles.titlebarControlSpace,
		width: isFullscreen ? 0 : trafficLightControlSpaceWidth,
	};
}

function buildDashboardTitleStyle(isFullscreen = false): CSSProperties {
	return {
		...styles.dashboardTitle,
		paddingBottom: isFullscreen
			? titlebarTextBottomInset
			: trafficLightTitlebarTextBottomInset,
	};
}

type DashboardReposTableProps = {
	onOpenRepo: (repoId: string) => void;
	repoRows: readonly RepoOverviewRow[];
	repoScanState: RepoScanState;
	skillArtifacts: readonly SkillArtifact[];
};

function DashboardReposTable(props: DashboardReposTableProps): ReactElement {
	if (props.repoScanState.status === "loading" && props.repoRows.length === 0) {
		return <div style={styles.dashboardMessage}>Scanning Git repos...</div>;
	}

	if (props.repoScanState.status === "error" && props.repoRows.length === 0) {
		return (
			<div style={styles.dashboardMessage}>{props.repoScanState.message}</div>
		);
	}

	if (props.repoRows.length === 0) {
		return <div style={styles.dashboardMessage}>No Git repos found yet.</div>;
	}

	return (
		<TooltipProvider>
			<Table aria-label="Repositories" style={styles.dashboardRepoTable}>
				<TableBody>
					{props.repoRows.map((row) => {
						const visual = repoVisualForRow(row);
						const skillIcons = buildRepoSkillIconItems(
							row,
							props.skillArtifacts,
						);
						const displaySkillCount =
							props.skillArtifacts.length === 0
								? row.skillFileCount
								: skillIcons.length;
						return (
							<TableRow key={row.id}>
								<TableCell>
									<div style={styles.dashboardRepoLine}>
										<span
											style={repoEmojiStyle(visual.background)}
											aria-hidden="true"
										>
											{visual.emoji}
										</span>
										<div style={styles.dashboardRepoText}>
											<RepoTitleButton
												onOpenRepo={props.onOpenRepo}
												row={row}
											/>
											<span style={styles.repoInlineMeta}>
												{repoSkillCountsLabel(row, displaySkillCount)}
											</span>
										</div>
									</div>
								</TableCell>
								<TableCell style={styles.dashboardSkillIconCell}>
									<div style={styles.dashboardSkillIconAligner}>
										<SkillIconStack skills={skillIcons} />
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</TooltipProvider>
	);
}

type SkillIconStackProps = {
	skills: readonly RepoSkillIconItem[];
};

function SkillIconStack(props: SkillIconStackProps): ReactElement | null {
	const [activeSkillId, setActiveSkillId] = useState<string | undefined>();

	if (props.skills.length === 0) {
		return null;
	}

	const activeIndex = activeSkillId
		? props.skills.findIndex((skill) => skill.id === activeSkillId)
		: -1;

	return (
		<fieldset style={styles.skillIconStack} aria-label="Repo skills">
			{props.skills.map((skill, index) => (
				<Tooltip key={skill.id} open={activeSkillId === skill.id}>
					<TooltipTrigger
						aria-label={skill.name}
						delay={80}
						onBlur={() => setActiveSkillId(undefined)}
						onFocus={() => setActiveSkillId(skill.id)}
						onPointerEnter={() => setActiveSkillId(skill.id)}
						onPointerLeave={() => setActiveSkillId(undefined)}
						style={skillStackIconStyle(skill, index, activeIndex)}
					>
						{skill.emoji}
					</TooltipTrigger>
					<TooltipContent>{skill.name}</TooltipContent>
				</Tooltip>
			))}
		</fieldset>
	);
}

type DashboardSkillsTableProps = {
	onOpenSkill: (skillId: string) => void;
	skillRows: readonly DetectedSkillRow[];
	skillScanState: SkillScanState;
};

function DashboardSkillsTable(props: DashboardSkillsTableProps): ReactElement {
	if (
		props.skillScanState.status === "loading" &&
		props.skillRows.length === 0
	) {
		return <div style={styles.dashboardMessage}>Scanning skills...</div>;
	}

	if (props.skillScanState.status === "error" && props.skillRows.length === 0) {
		return (
			<div style={styles.dashboardMessage}>{props.skillScanState.message}</div>
		);
	}

	if (props.skillRows.length === 0) {
		return <div style={styles.dashboardMessage}>No skills found yet.</div>;
	}

	return (
		<Table aria-label="Skills" style={styles.dashboardTable}>
			<TableBody>
				{props.skillRows.map((skill) => (
					<TableRow key={skill.id}>
						<TableCell>
							<div style={styles.skillNameCell}>
								<span
									style={skillEmojiStyle(skill.background)}
									aria-hidden="true"
								>
									{skill.emoji}
								</span>
								<SkillNameButton
									onOpenSkill={props.onOpenSkill}
									skill={skill}
								/>
							</div>
						</TableCell>
						<TableCell style={styles.dashboardTableRight}>
							{skill.sourceLabel}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function DetectedSkills(props: DetectedSkillsProps): ReactElement {
	if (
		props.skillScanState.status === "loading" &&
		props.skillScanState.skills.length === 0
	) {
		return <div style={styles.scanMessage}>Scanning skills...</div>;
	}

	if (
		props.skillScanState.status === "error" &&
		props.skillScanState.skills.length === 0
	) {
		return <div style={styles.scanMessage}>{props.skillScanState.message}</div>;
	}

	if (props.skillScanState.skills.length === 0) {
		return <div style={styles.scanMessage}>No skills found yet.</div>;
	}

	return (
		<div style={styles.skillTableWrap}>
			<Table
				aria-label="Skills found on this machine"
				style={styles.skillTable}
			>
				<TableHeader>
					<TableRow>
						<TableHead>Skill</TableHead>
						<TableHead style={styles.tableHeadRight}>Source</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{props.skillScanState.skills.map((skill) => (
						<TableRow key={skill.id}>
							<TableCell>
								<div style={styles.skillNameCell}>
									<span
										style={skillEmojiStyle(skill.background)}
										aria-hidden="true"
									>
										{skill.emoji}
									</span>
									<SkillNameButton
										onOpenSkill={props.onOpenSkill}
										skill={skill}
									/>
								</div>
							</TableCell>
							<TableCell style={styles.tableCellRight}>
								<span title={skill.sourceLabel} style={styles.sourceLabel}>
									<span style={styles.sourcePrimaryLabel}>
										{skill.sourcePrimaryLabel}
									</span>
									{skill.additionalSourceCount > 0 ? (
										<span style={styles.sourceCount}>
											{" "}
											+ {skill.additionalSourceCount}
										</span>
									) : null}
								</span>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

type SkillNameButtonProps = {
	onOpenSkill: (skillId: string) => void;
	skill: DetectedSkillRow;
};

function SkillNameButton(props: SkillNameButtonProps): ReactElement {
	return (
		<Button
			aria-label={`Open ${props.skill.name}`}
			onClick={() => props.onOpenSkill(props.skill.id)}
			size="xs"
			variant="link"
		>
			{props.skill.name}
		</Button>
	);
}

type DashboardBreadcrumbItemsInput = {
	onShowMain: () => void;
	onShowRepos: () => void;
	onShowSkills: () => void;
	selectedRepo: RepoOverviewRow | undefined;
	selectedSkill: DetectedSkillRow | undefined;
};

function dashboardBreadcrumbItems(
	input: DashboardBreadcrumbItemsInput,
): readonly DashboardBreadcrumbItem[] {
	if (input.selectedSkill) {
		return [
			{ key: "main", label: "Main", onSelect: input.onShowMain },
			{ key: "skills", label: "Skills", onSelect: input.onShowSkills },
			{
				key: `skill:${input.selectedSkill.id}`,
				label: input.selectedSkill.name,
			},
		];
	}

	if (input.selectedRepo) {
		return [
			{ key: "main", label: "Main", onSelect: input.onShowMain },
			{ key: "repos", label: "Repos", onSelect: input.onShowRepos },
			{ key: input.selectedRepo.id, label: input.selectedRepo.displayName },
		];
	}

	return [];
}

type DashboardBreadcrumbProps = {
	items: readonly DashboardBreadcrumbItem[];
};

function DashboardBreadcrumb(props: DashboardBreadcrumbProps): ReactElement {
	return (
		<nav aria-label="Breadcrumb" style={styles.breadcrumb}>
			{props.items.map((item, index) => (
				<BreadcrumbItem
					isCurrent={index === props.items.length - 1}
					item={item}
					key={item.key}
				/>
			))}
		</nav>
	);
}

type BreadcrumbItemProps = {
	isCurrent: boolean;
	item: DashboardBreadcrumbItem;
};

function BreadcrumbItem(props: BreadcrumbItemProps): ReactElement {
	return (
		<>
			{props.isCurrent ? (
				<span aria-current="page" style={styles.breadcrumbCurrent}>
					{props.item.label}
				</span>
			) : (
				<Button
					onClick={props.item.onSelect}
					style={styles.breadcrumbButton}
					variant="link"
				>
					{props.item.label}
				</Button>
			)}
			{props.isCurrent ? null : (
				<span aria-hidden="true" style={styles.breadcrumbSeparator}>
					/
				</span>
			)}
		</>
	);
}

type SkillDetailPageProps = {
	repoRows: readonly RepoOverviewRow[];
	skill: DetectedSkillRow;
	skillArtifacts: readonly SkillArtifact[];
};

function SkillDetailPage(props: SkillDetailPageProps): ReactElement {
	const [activeTab, setActiveTab] = useState<"definition" | "rollouts">(
		"definition",
	);
	const rolloutRows = buildSkillRolloutRows(
		props.skill,
		props.repoRows,
		props.skillArtifacts,
	);
	const rolloutCopyCount = rolloutRows.reduce(
		(total, row) => total + row.copyCount,
		0,
	);
	const attentionCount = rolloutRows.filter((row) =>
		isAttentionStatus(row.status),
	).length;
	const targetLabels = skillTargetLabelsForSkill(
		props.skill,
		props.skillArtifacts,
	);
	const rolloutArtifacts = props.skillArtifacts.filter((artifact) =>
		artifactBelongsToSkill(artifact, props.skill),
	);
	const blueprintVersion = skillBlueprintVersionForArtifacts(rolloutArtifacts);
	const isManagedSkill = rolloutArtifacts.some(
		(artifact) => artifact.lockfileEntry,
	);
	const summary = `${formatCount(rolloutCopyCount, "copy")} found · ${formatCount(
		rolloutRows.length,
		"repo",
	)} · ${attentionCount} need attention`;

	function handleValueChange(value: string | number | null) {
		if (value === "definition" || value === "rollouts") {
			setActiveTab(value);
		}
	}

	return (
		<div style={styles.skillDetailPage}>
			<section aria-labelledby="skill-detail-title" style={styles.skillHero}>
				<div style={styles.skillHeroText}>
					<div style={styles.skillHeroTitleRow}>
						<span
							aria-hidden="true"
							style={skillDetailEmojiStyle(props.skill.background)}
						>
							{props.skill.emoji}
						</span>
						<h1 id="skill-detail-title" style={styles.skillHeroTitle}>
							{props.skill.name}
						</h1>
						<Badge variant="hardcoded">
							{isManagedSkill ? "Team blueprint" : "Local skill"}
						</Badge>
						{blueprintVersion ? (
							<Badge variant="hardcoded">Published {blueprintVersion}</Badge>
						) : null}
					</div>
					<p style={styles.skillHeroSummary}>
						{props.skill.sourcePrimaryLabel} · {summary}
					</p>
					<div style={styles.skillHeroChips}>
						<Badge variant="hardcoded">
							{isManagedSkill ? "Managed" : "Unmanaged"}
						</Badge>
						<Badge variant="hardcoded">
							{skillContentHasScripts(props.skill.content)
								? "Scripts"
								: "No scripts"}
						</Badge>
						<Badge variant="hardcoded">
							{formatCount(targetLabels.length, "target")}
							{targetLabels.length > 0 ? ` · ${targetLabels.join(" · ")}` : ""}
						</Badge>
					</div>
				</div>
				<div style={styles.skillHeroActions}>
					<Button size="sm" variant="hardcoded">
						Edit draft
					</Button>
					<Button size="sm" variant="hardcoded">
						{activeTab === "rollouts" ? "Plan changes" : "Review rollouts"}
					</Button>
				</div>
			</section>

			<Tabs
				onValueChange={handleValueChange}
				style={styles.skillDetailTabs}
				value={activeTab}
			>
				<div style={styles.skillTabsBar}>
					<TabsList variant="line">
						<TabsTrigger style={skillDetailTabStyle} value="definition">
							<span style={styles.hardcodedRolloutText}>Definition</span>
						</TabsTrigger>
						<TabsTrigger style={skillDetailTabStyle} value="rollouts">
							<span style={styles.hardcodedRolloutText}>Rollouts</span>
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent value="definition">
					<SkillDefinitionPanel skill={props.skill} />
				</TabsContent>
				<TabsContent value="rollouts">
					<SkillRolloutsPanel rows={rolloutRows} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

type SkillDefinitionPanelProps = {
	skill: DetectedSkillRow;
};

function SkillDefinitionPanel(props: SkillDefinitionPanelProps): ReactElement {
	const content =
		props.skill.content.trim().length > 0
			? props.skill.content
			: "No content available for this skill.";

	return (
		<section
			aria-label={`${props.skill.name} definition`}
			style={styles.skillDefinitionPanel}
		>
			<div style={styles.skillDetailHeader}>
				<div style={styles.skillDetailMeta}>
					<div style={styles.skillDetailSource}>
						<span style={styles.hardcodedRolloutText}>Definition</span>
					</div>
					<div style={styles.skillDetailSummary}>
						{formatCount(props.skill.copyCount, "copy")} across{" "}
						{props.skill.sourceLabel}
					</div>
				</div>
			</div>

			<pre style={styles.skillContent}>{content}</pre>
		</section>
	);
}

type SkillRolloutsPanelProps = {
	rows: readonly SkillRolloutRow[];
};

type RudelTableHeadCellsProps = {
	columns: readonly RudelTableColumn[];
};

function RudelTableHeadCells(props: RudelTableHeadCellsProps): ReactElement {
	return (
		<>
			{props.columns.map((column) => (
				<TableHead
					key={column.id}
					textAlign={column.textAlign}
					width={column.width}
				>
					{column.hardcoded ? (
						<span style={styles.hardcodedRolloutText}>{column.label}</span>
					) : (
						column.label
					)}
				</TableHead>
			))}
		</>
	);
}

function SkillRolloutsPanel(props: SkillRolloutsPanelProps): ReactElement {
	const [activeFilter, setActiveFilter] = useState<SkillRolloutFilter>("all");
	const filteredRows = props.rows.filter((row) =>
		skillRolloutFilterMatches(row, activeFilter),
	);

	return (
		<section aria-label="Skill rollouts" style={styles.rolloutsPage}>
			<div style={styles.rolloutFilterBar}>
				{skillRolloutFilterOptions.map((option) => (
					<Button
						aria-pressed={activeFilter === option.filter}
						key={option.filter}
						onClick={() => setActiveFilter(option.filter)}
						size="sm"
						variant={activeFilter === option.filter ? "hardcoded" : "outline"}
					>
						<span style={styles.hardcodedRolloutText}>{option.label}</span>{" "}
						<span style={styles.rolloutFilterCount}>
							{skillRolloutFilterCount(props.rows, option.filter)}
						</span>
					</Button>
				))}
			</div>

			{filteredRows.length > 0 ? (
				<Table aria-label="Skill rollouts">
					<TableHeader>
						<TableRow>
							<RudelTableHeadCells columns={skillRolloutTableColumns} />
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredRows.map((row) => (
							<TableRow key={row.id}>
								<TableCell>
									<div style={styles.rolloutRepoName}>{row.repoName}</div>
									<div
										style={
											row.repoIsLocalOnly
												? styles.rolloutRepoLocalIdentity
												: styles.rolloutRepoIdentity
										}
									>
										{row.repoIdentity}
									</div>
								</TableCell>
								<TableCell>
									<Badge variant="hardcoded">{row.statusLabel}</Badge>
								</TableCell>
								<TableCell style={styles.rolloutHardcodedCell}>
									{row.targetLabel}
								</TableCell>
								<TableCell style={styles.rolloutHardcodedCell}>
									{row.overlayLabel}
								</TableCell>
								<TableCell style={styles.rolloutCopiesCell} textAlign="right">
									{row.copyCount}
								</TableCell>
								<TableCell textAlign="right">
									<SkillRolloutActionCell row={row} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<div style={styles.rolloutEmptyState}>
					<span style={styles.hardcodedRolloutText}>
						No repositories match this rollout filter.
					</span>
				</div>
			)}
		</section>
	);
}

type SkillRolloutActionCellProps = {
	row: SkillRolloutRow;
};

function SkillRolloutActionCell(
	props: SkillRolloutActionCellProps,
): ReactElement {
	if (props.row.action === "adopt_ignore") {
		return (
			<div style={styles.rolloutSegmentedAction}>
				<Button size="sm" variant="hardcoded">
					Adopt
				</Button>
				<Button size="sm" variant="hardcoded">
					Ignore
				</Button>
			</div>
		);
	}

	if (props.row.action === "none" || props.row.action === "view") {
		return (
			<span style={styles.rolloutNoAction}>
				<span style={styles.hardcodedRolloutText}>-</span>
			</span>
		);
	}

	return (
		<Button size="sm" variant="hardcoded">
			{skillRolloutActionLabel(props.row)}
		</Button>
	);
}

type RepoDetailPageProps = {
	onOpenSkill: (skillId: string) => void;
	repo: RepoOverviewRow;
	skillArtifacts: readonly SkillArtifact[];
	skillRows: readonly DetectedSkillRow[];
	skillScanState: SkillScanState;
};

function RepoDetailPage(props: RepoDetailPageProps): ReactElement {
	const repoArtifacts = repoArtifactsForRow(props.repo, props.skillArtifacts);
	const inventoryRows = buildRepoSkillInventoryRows(
		props.repo,
		props.skillArtifacts,
		props.skillRows,
	);
	const attentionCount = inventoryRows.filter((row) =>
		isAttentionStatus(row.status),
	).length;
	const managedSkillCount = inventoryRows.filter(
		(row) => row.source !== "local_skill",
	).length;
	const unmanagedCount = inventoryRows.filter(
		(row) => row.status === "unmanaged",
	).length;
	const overlayRows = inventoryRows.filter((row) => row.hasOverlay);
	const lockfilePresent = repoArtifacts.some(
		(artifact) => artifact.lockfileEntry,
	);
	const targetLabels = repoMaterializationTargetLabels(repoArtifacts);
	const materializationMode = repoArtifacts.some(
		(artifact) => artifact.sourceScope === "symlink",
	)
		? "Symlinked"
		: repoArtifacts.length > 0
			? "Discovered"
			: "No materializations";

	return (
		<div style={styles.repoDetailPage}>
			<section aria-labelledby="repo-detail-title" style={styles.repoHero}>
				<div style={styles.repoHeroTop}>
					<div style={styles.repoHeroIdentity}>
						<div style={styles.repoEyebrow}>{props.repo.identity}</div>
						<div style={styles.repoTitleRow}>
							<h1 id="repo-detail-title" style={styles.repoDetailTitle}>
								{props.repo.displayName}
							</h1>
							<Badge variant={lockfilePresent ? "info" : "outline"}>
								{lockfilePresent ? "Managed" : "Discovered"}
							</Badge>
							<Badge variant={attentionCount > 0 ? "warning" : "success"}>
								{attentionCount > 0 ? "Needs attention" : "Current"}
							</Badge>
						</div>
						<p style={styles.repoDetailPath}>{props.repo.linkLabel}</p>
						<ul style={styles.repoMetaList}>
							<li style={styles.repoMetaItem}>
								<span style={styles.repoMetaDot} aria-hidden="true" />
								{props.repo.branchName ?? "unknown"} ·{" "}
								{props.repo.isDirty ? "dirty" : "clean"}
							</li>
							<li style={styles.repoMetaItem}>
								<span style={styles.repoMetaDot} aria-hidden="true" />
								{lockfilePresent ? "Lockfile present" : "No lockfile yet"}
							</li>
							<li style={styles.repoMetaItem}>
								<span style={styles.repoMetaDot} aria-hidden="true" />
								{materializationMode}
							</li>
							<li style={styles.repoMetaItem}>
								<span style={styles.repoMetaDot} aria-hidden="true" />
								Last scan current session
							</li>
						</ul>
					</div>
					<div style={styles.repoHeroActions}>
						<Button size="sm" variant="outline">
							Sync from team
						</Button>
						<Button size="sm">Plan changes</Button>
					</div>
				</div>

				<div style={styles.repoSummaryGrid}>
					<RepoSummaryStat
						detail="files"
						label="Agent knowledge"
						value={String(repoArtifacts.length)}
					/>
					<RepoSummaryStat
						detail={`${attentionCount} need attention`}
						label="Team skills"
						value={String(managedSkillCount)}
						variant={attentionCount > 0 ? "warning" : "default"}
					/>
					<RepoSummaryStat
						detail="local"
						label="Unmanaged"
						value={String(unmanagedCount)}
					/>
					<RepoSummaryStat
						detail="active"
						label="Overlays"
						value={String(overlayRows.length)}
					/>
				</div>
			</section>

			<section aria-labelledby="repo-skills-title" style={styles.repoSection}>
				<div style={styles.repoSectionHeader}>
					<div style={styles.repoSectionTitleGroup}>
						<h2 id="repo-skills-title" style={styles.repoSectionTitle}>
							Skills in this repo
						</h2>
						<span style={styles.repoSectionCount}>
							{inventoryRows.length} detected
						</span>
					</div>
					<Button size="sm" variant="outline">
						Filter
					</Button>
				</div>

				{inventoryRows.length > 0 ? (
					<Table aria-label="Skills in this repo">
						<TableHeader>
							<TableRow>
								<RudelTableHeadCells columns={repoSkillInventoryColumns} />
							</TableRow>
						</TableHeader>
						<TableBody>
							{inventoryRows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<div style={styles.repoInventoryNameCell}>
											<span style={styles.repoInventoryName}>{row.name}</span>
											{row.hasOverlay ? (
												<Badge variant="secondary">overlay</Badge>
											) : null}
										</div>
										<div style={styles.repoInventoryTargets}>
											{row.targetLabels.join(" · ")}
										</div>
									</TableCell>
									<TableCell>
										<Badge variant={badgeVariantForStatus(row.status)}>
											{row.statusLabel}
										</Badge>
									</TableCell>
									<TableCell>
										<Badge variant={badgeVariantForSource(row.source)}>
											{row.sourceLabel}
										</Badge>
									</TableCell>
									<TableCell textAlign="right">
										<RepoInventoryActionCell
											onOpenSkill={props.onOpenSkill}
											row={row}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<div style={styles.repoEmptyState}>
						{props.skillScanState.status === "loading"
							? "Scanning agent knowledge for this repo..."
							: "No repo-local skills or managed context files found yet."}
					</div>
				)}
			</section>

			<section aria-labelledby="repo-overlays-title" style={styles.repoSection}>
				<div style={styles.repoSectionHeader}>
					<div style={styles.repoSectionTitleGroup}>
						<h2 id="repo-overlays-title" style={styles.repoSectionTitle}>
							Repo overlays
						</h2>
						<span style={styles.repoSectionCount}>
							{overlayRows.length} active
						</span>
					</div>
					<Button size="sm" variant="outline">
						Open .rudel/overlay.yaml
					</Button>
				</div>
				<div style={styles.repoOverlayPanel}>
					{overlayRows.length > 0 ? (
						overlayRows.map((row) => (
							<div key={row.id} style={styles.repoOverlayRow}>
								<div>
									<div style={styles.repoOverlayTitle}>{row.name}</div>
									<div style={styles.repoOverlayMeta}>
										overlay hash {row.overlayHash}
									</div>
								</div>
								<div style={styles.repoOverlayActions}>
									<Button size="xs" variant="outline">
										Edit
									</Button>
									<Button size="xs" variant="outline">
										Promote
									</Button>
								</div>
							</div>
						))
					) : (
						<div style={styles.repoEmptyState}>
							No repo-specific overlays detected.
						</div>
					)}
				</div>
			</section>

			<section
				aria-label="Materialization"
				style={styles.repoMaterializationPanel}
			>
				<div style={styles.repoMaterializationText}>
					<div style={styles.repoOverlayTitle}>Materialization</div>
					<div style={styles.repoOverlayMeta}>
						{materializationMode}
						{targetLabels.length > 0 ? ` · ${targetLabels.join(" · ")}` : ""}
					</div>
				</div>
				<Button size="sm" variant="outline">
					Expand
				</Button>
			</section>

			<footer style={styles.repoDetailFooter}>
				<span>
					{lockfilePresent ? "Lockfile-backed" : "Local scan only"} ·{" "}
					{props.repo.repoRootPath}
				</span>
				<span>Rudel 0.1.0</span>
			</footer>
		</div>
	);
}

type RepoSummaryStatProps = {
	detail: string;
	label: string;
	value: string;
	variant?: "default" | "warning";
};

function RepoSummaryStat(props: RepoSummaryStatProps): ReactElement {
	return (
		<div
			style={{
				...styles.repoSummaryStat,
				...(props.variant === "warning" ? styles.repoSummaryStatWarning : {}),
			}}
		>
			<div style={styles.repoSummaryLabel}>{props.label}</div>
			<div style={styles.repoSummaryValueRow}>
				<span style={styles.repoSummaryValue}>{props.value}</span>
				<span style={styles.repoSummaryDetail}>{props.detail}</span>
			</div>
		</div>
	);
}

type RepoInventoryActionCellProps = {
	onOpenSkill: (skillId: string) => void;
	row: RepoSkillInventoryRow;
};

function RepoInventoryActionCell(
	props: RepoInventoryActionCellProps,
): ReactElement {
	if (props.row.action === "adopt_ignore") {
		return (
			<div style={styles.repoSegmentedAction}>
				<Button size="xs" variant="outline">
					Adopt
				</Button>
				<Button size="xs" variant="outline">
					Ignore
				</Button>
			</div>
		);
	}

	if (props.row.action === "none") {
		return <span style={styles.repoNoAction}>-</span>;
	}

	const label = repoActionLabel(props.row.action);
	const canOpenSkill =
		props.row.skillId !== undefined && props.row.action !== "add_section";

	function openSkill() {
		if (props.row.skillId) {
			props.onOpenSkill(props.row.skillId);
		}
	}

	return (
		<Button
			onClick={canOpenSkill ? openSkill : undefined}
			size="sm"
			variant="outline"
		>
			{label}
		</Button>
	);
}

type RepositorySelectionProps = {
	repoScanState: RepoScanState;
	selectedRepoIds: readonly string[];
	onToggleRepo: (repoId: string) => void;
};

function RepositorySelection(props: RepositorySelectionProps): ReactElement {
	if (
		props.repoScanState.status === "loading" &&
		props.repoScanState.rows.length === 0
	) {
		return <div style={styles.scanMessage}>Scanning Git repos...</div>;
	}

	if (
		props.repoScanState.status === "error" &&
		props.repoScanState.rows.length === 0
	) {
		return <div style={styles.scanMessage}>{props.repoScanState.message}</div>;
	}

	if (props.repoScanState.rows.length === 0) {
		return <div style={styles.scanMessage}>No Git repos found yet.</div>;
	}

	return (
		<div style={styles.repoTableWrap}>
			<Table aria-label="Select main repositories" style={styles.repoTable}>
				<TableHeader>
					<TableRow>
						<TableHead style={styles.repoSelectHead}>
							<span style={styles.visuallyHidden}>Select</span>
						</TableHead>
						<TableHead>Repository</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{props.repoScanState.rows.map((row) => {
						const isSelected = props.selectedRepoIds.includes(row.id);
						const repoVisual = repoVisualForRow(row);
						return (
							<TableRow key={row.id}>
								<TableCell style={styles.repoSelectCell}>
									<Checkbox
										aria-label={`Select ${row.linkLabel}`}
										name="selected-repos"
										checked={isSelected}
										onChange={() => props.onToggleRepo(row.id)}
									/>
								</TableCell>
								<TableCell>
									<div style={styles.repoTitleCell}>
										<span
											style={repoEmojiStyle(repoVisual.background)}
											aria-hidden="true"
										>
											{repoVisual.emoji}
										</span>
										<div style={styles.repoNameCell}>
											<div style={styles.dashboardRepoLine}>
												<RepoTitleLabel row={row} />
												<span style={styles.repoInlineMeta}>
													{repoSkillCountsLabel(row, row.skillFileCount)}
												</span>
											</div>
										</div>
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

type RepoTitleButtonProps = {
	onOpenRepo: (repoId: string) => void;
	row: RepoOverviewRow;
};

function RepoTitleButton(props: RepoTitleButtonProps): ReactElement {
	return (
		<Button
			aria-label={`Open ${props.row.displayName}`}
			onClick={() => props.onOpenRepo(props.row.id)}
			size="xs"
			title={props.row.linkLabel}
			variant="link"
		>
			{props.row.displayName}
		</Button>
	);
}

type RepoTitleLabelProps = {
	row: RepoOverviewRow;
};

function RepoTitleLabel(props: RepoTitleLabelProps): ReactElement {
	return (
		<span style={styles.repoTitleText} title={props.row.linkLabel}>
			{props.row.displayName}
		</span>
	);
}

export function buildDetectedSkillRows(
	scanResult: MachineScanResult,
): readonly DetectedSkillRow[] {
	return buildDetectedSkillRowsFromArtifacts(scanResult.artifacts);
}

function buildDetectedSkillRowsFromArtifacts(
	artifacts: readonly SkillArtifact[],
): readonly DetectedSkillRow[] {
	let rows: readonly DetectedSkillRow[] = [];
	for (const artifact of artifacts) {
		rows = upsertDetectedSkillRow(rows, artifact);
	}
	return rows;
}

function upsertSkillArtifact(
	artifacts: readonly SkillArtifact[],
	artifact: SkillArtifact,
): readonly SkillArtifact[] {
	const artifactKey = skillArtifactKey(artifact);
	if (
		artifacts.some(
			(existingArtifact) => skillArtifactKey(existingArtifact) === artifactKey,
		)
	) {
		return artifacts.map((existingArtifact) =>
			skillArtifactKey(existingArtifact) === artifactKey
				? artifact
				: existingArtifact,
		);
	}
	return [...artifacts, artifact];
}

function upsertDetectedSkillRow(
	rows: readonly DetectedSkillRow[],
	artifact: SkillArtifact,
): readonly DetectedSkillRow[] {
	if (!artifact.path.endsWith("SKILL.md")) {
		return rows;
	}

	const name = skillNameForArtifact(artifact);
	const id = name.toLocaleLowerCase();
	const source = sourceForArtifact(artifact);
	const existing = rows.find((row) => row.id === id);
	if (!existing) {
		return [...rows, createDetectedSkillRow(id, name, [source], 1)].sort(
			sortDetectedSkillRows,
		);
	}

	const sources = existing.sources.some(
		(existingSource) => existingSource.key === source.key,
	)
		? existing.sources
		: [...existing.sources, source].sort(sortDetectedSkillSources);
	const nextRow = createDetectedSkillRow(
		existing.id,
		existing.name,
		sources,
		existing.copyCount + 1,
	);

	return rows
		.map((row) => (row.id === id ? nextRow : row))
		.sort(sortDetectedSkillRows);
}

function createDetectedSkillRow(
	id: string,
	name: string,
	sources: readonly DetectedSkillSource[],
	copyCount: number,
): DetectedSkillRow {
	const visual = skillVisualForName(name);
	const sourceLabel = sourceLabelForRow(sources);
	const sourcePrimaryLabel = sources[0]?.label ?? "Local";
	const additionalSourceCount = Math.max(sources.length - 1, 0);
	const content = sources[0]?.content ?? "";
	return {
		id,
		name,
		sourceLabel,
		sourcePrimaryLabel,
		additionalSourceCount,
		emoji: visual.emoji,
		background: visual.background,
		sources,
		content,
		copyCount,
	};
}

function sortDetectedSkillRows(
	left: DetectedSkillRow,
	right: DetectedSkillRow,
): number {
	return (
		right.sources.length - left.sources.length ||
		left.name.localeCompare(right.name)
	);
}

function skillsFromScanState(
	state: SkillScanState,
): readonly DetectedSkillRow[] {
	return state.skills;
}

function stepStyle(isActive: boolean, isComplete: boolean): CSSProperties {
	return {
		...styles.step,
		...(isActive || isComplete ? styles.stepActive : {}),
	};
}

function skillEmojiStyle(background: string): CSSProperties {
	return {
		...styles.skillEmoji,
		background,
	};
}

function skillDetailEmojiStyle(background: string): CSSProperties {
	return {
		...styles.skillDetailEmoji,
		background,
	};
}

function skillDetailTabStyle(state: { active: boolean }): CSSProperties {
	return {
		...styles.skillDetailTab,
		...(state.active ? styles.skillDetailTabActive : {}),
	};
}

function repoEmojiStyle(background: string): CSSProperties {
	return {
		...styles.repoEmoji,
		background,
	};
}

function skillStackIconStyle(
	skill: RepoSkillIconItem,
	index: number,
	activeIndex: number,
): CSSProperties {
	const hasActiveSkill = activeIndex >= 0;
	const translateX = !hasActiveSkill
		? 0
		: index < activeIndex
			? -6
			: index > activeIndex
				? 6
				: 0;
	const isActive = index === activeIndex;
	return {
		...styles.skillStackIcon,
		background: skill.background,
		marginLeft: index === 0 ? 0 : -8,
		zIndex: isActive ? 20 : 1,
		transform: `translateX(${translateX}px) scale(${isActive ? 1.08 : 1})`,
	};
}

function skillNameForArtifact(artifact: SkillArtifact): string {
	return artifact.name ?? skillFolderName(artifact.path) ?? "Untitled skill";
}

function skillFolderName(path: string): string | undefined {
	const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
	const skillFileIndex = parts.lastIndexOf("SKILL.md");
	if (skillFileIndex <= 0) {
		return undefined;
	}
	return parts[skillFileIndex - 1];
}

function sourceForArtifact(artifact: SkillArtifact): DetectedSkillSource {
	const repoName = artifact.repoRootPath
		? pathBaseName(artifact.repoRootPath)
		: undefined;
	if (repoName) {
		return {
			key: `repo:${artifact.repoRootPath}`,
			label: repoName,
			content: artifact.content,
			priority: 0,
		};
	}

	switch (artifact.sourceScope) {
		case "global_user":
			return {
				key: "global",
				label: "Global",
				content: artifact.content,
				priority: 1,
			};
		case "nested_repo":
			return {
				key: "nested-repo",
				label: "Nested repo",
				content: artifact.content,
				priority: 0,
			};
		case "repo":
			return {
				key: "repo",
				label: "Repo",
				content: artifact.content,
				priority: 0,
			};
		case "symlink":
			return {
				key: "symlink",
				label: "Symlink",
				content: artifact.content,
				priority: 2,
			};
		case "unknown":
			return {
				key: "local",
				label: "Local",
				content: artifact.content,
				priority: 3,
			};
	}
}

function pathBaseName(path: string): string | undefined {
	const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
	return parts[parts.length - 1];
}

function skillRowForId(
	rows: readonly DetectedSkillRow[],
	skillId: string,
): DetectedSkillRow | undefined {
	return rows.find((row) => row.id === skillId);
}

function repoRowForId(
	rows: readonly RepoOverviewRow[],
	repoId: string,
): RepoOverviewRow | undefined {
	return rows.find((row) => row.id === repoId);
}

function sourceLabelForRow(sources: readonly DetectedSkillSource[]): string {
	const primarySource = sources[0]?.label ?? "Local";
	const additionalSourceCount = sources.length - 1;
	if (additionalSourceCount > 0) {
		return `${primarySource} + ${additionalSourceCount}`;
	}
	return primarySource;
}

function repoSkillCountsLabel(
	row: RepoOverviewRow,
	skillCount: number,
): string {
	return `${formatCount(skillCount, "skill")} · ${row.dirtySkillFileCount} dirty`;
}

function formatCount(count: number, singularLabel: string): string {
	return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

export function buildRepoSkillIconItems(
	row: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
): readonly RepoSkillIconItem[] {
	const repoRootPaths = new Set(row.repoRootPaths);
	const itemsByName = new Map<string, RepoSkillIconItem>();
	for (const artifact of artifacts) {
		if (!artifact.repoRootPath || !repoRootPaths.has(artifact.repoRootPath)) {
			continue;
		}
		const item = skillIconItemForArtifact(artifact);
		const itemKey = item.name.trim().toLocaleLowerCase();
		if (!itemsByName.has(itemKey)) {
			itemsByName.set(itemKey, item);
		}
	}
	return [...itemsByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}

export function buildRepoSkillInventoryRows(
	row: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
	skillRows: readonly DetectedSkillRow[],
): readonly RepoSkillInventoryRow[] {
	const groups = new Map<string, RepoSkillInventoryGroup>();
	for (const artifact of repoArtifactsForRow(row, artifacts)) {
		const name = motherSkillDisplayNameForArtifact(artifact);
		const id = name.trim().toLocaleLowerCase();
		const existingGroup = groups.get(id);
		groups.set(id, {
			id,
			name,
			artifacts: existingGroup
				? [...existingGroup.artifacts, artifact]
				: [artifact],
		});
	}

	return [...groups.values()]
		.map((group) => repoSkillInventoryRowForGroup(group, skillRows))
		.sort(sortRepoSkillInventoryRows);
}

export function buildSkillRolloutRows(
	skill: DetectedSkillRow,
	repoRows: readonly RepoOverviewRow[],
	artifacts: readonly SkillArtifact[],
): readonly SkillRolloutRow[] {
	const skillArtifacts = artifacts.filter((artifact) =>
		artifactBelongsToSkill(artifact, skill),
	);
	const usedArtifactKeys = new Set<string>();
	const rows: SkillRolloutRow[] = [];

	for (const repoRow of repoRows) {
		const repoRootPaths = new Set(repoRow.repoRootPaths);
		const repoArtifacts = skillArtifacts.filter(
			(artifact) =>
				artifact.repoRootPath !== undefined &&
				repoRootPaths.has(artifact.repoRootPath),
		);
		if (repoArtifacts.length === 0) {
			continue;
		}
		for (const artifact of repoArtifacts) {
			usedArtifactKeys.add(skillArtifactKey(artifact));
		}
		rows.push(skillRolloutRowForRepo(repoRow, repoArtifacts));
	}

	const orphanGroups = new Map<string, SkillArtifact[]>();
	for (const artifact of skillArtifacts) {
		const artifactKey = skillArtifactKey(artifact);
		if (!artifact.repoRootPath || usedArtifactKeys.has(artifactKey)) {
			continue;
		}
		orphanGroups.set(artifact.repoRootPath, [
			...(orphanGroups.get(artifact.repoRootPath) ?? []),
			artifact,
		]);
	}

	for (const [repoRootPath, repoArtifacts] of orphanGroups) {
		rows.push(skillRolloutRowForOrphanRepo(repoRootPath, repoArtifacts));
	}

	return rows;
}

interface RepoSkillInventoryGroup {
	id: string;
	name: string;
	artifacts: readonly SkillArtifact[];
}

function repoArtifactsForRow(
	row: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
): readonly SkillArtifact[] {
	const repoRootPaths = new Set(row.repoRootPaths);
	return artifacts.filter(
		(artifact) =>
			artifact.repoRootPath !== undefined &&
			repoRootPaths.has(artifact.repoRootPath),
	);
}

function repoSkillInventoryRowForGroup(
	group: RepoSkillInventoryGroup,
	skillRows: readonly DetectedSkillRow[],
): RepoSkillInventoryRow {
	const status = repoSkillStatusForArtifacts(group.artifacts);
	const source = repoSkillSourceForArtifacts(group.artifacts);
	const matchingSkill = skillRowForId(skillRows, group.id);
	const overlayHash = overlayHashForArtifacts(group.artifacts);
	return {
		id: group.id,
		name: group.name,
		status,
		statusLabel: statusLabelForRepoSkill(status),
		source,
		sourceLabel: sourceLabelForRepoSkill(source, group.artifacts),
		action: actionForRepoSkillStatus(status),
		targetLabels: repoMaterializationTargetLabels(group.artifacts),
		skillId: matchingSkill?.id,
		overlayHash,
		hasOverlay: overlayHash !== undefined,
		copyCount: group.artifacts.length,
	};
}

function skillRolloutRowForRepo(
	repoRow: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
): SkillRolloutRow {
	const status = repoSkillStatusForArtifacts(artifacts);
	return {
		id: repoRow.id,
		repoName: repoRow.displayName,
		repoIdentity: repoRow.identity,
		repoIsLocalOnly: repoRow.linkHref === undefined,
		status,
		statusLabel: statusLabelForRepoSkill(status),
		targetLabel: skillRolloutTargetLabel(artifacts),
		overlayLabel: skillRolloutOverlayLabel(artifacts),
		copyCount: artifacts.length,
		action: skillRolloutActionForStatus(status),
	};
}

function skillRolloutRowForOrphanRepo(
	repoRootPath: string,
	artifacts: readonly SkillArtifact[],
): SkillRolloutRow {
	const status = repoSkillStatusForArtifacts(artifacts);
	return {
		id: `local:${repoRootPath}`,
		repoName: pathBaseName(repoRootPath) ?? repoRootPath,
		repoIdentity: "local-only",
		repoIsLocalOnly: true,
		status,
		statusLabel: statusLabelForRepoSkill(status),
		targetLabel: skillRolloutTargetLabel(artifacts),
		overlayLabel: skillRolloutOverlayLabel(artifacts),
		copyCount: artifacts.length,
		action: skillRolloutActionForStatus(status),
	};
}

function artifactBelongsToSkill(
	artifact: SkillArtifact,
	skill: DetectedSkillRow,
): boolean {
	return (
		artifact.repoRootPath !== undefined &&
		motherSkillDisplayNameForArtifact(artifact).trim().toLocaleLowerCase() ===
			skill.id
	);
}

function skillTargetLabelsForSkill(
	skill: DetectedSkillRow,
	artifacts: readonly SkillArtifact[],
): readonly string[] {
	return repoMaterializationTargetLabels(
		artifacts.filter((artifact) => artifactBelongsToSkill(artifact, skill)),
	);
}

function skillRolloutTargetLabel(artifacts: readonly SkillArtifact[]): string {
	if (artifacts.some((artifact) => artifact.sourceScope === "symlink")) {
		return "Symlinked";
	}

	const labels = repoMaterializationTargetLabels(artifacts).filter(
		(label) => label !== "Unknown",
	);
	if (labels.length === 0) {
		return "Unknown";
	}
	if (labels.length === 1) {
		const label = labels[0] ?? "Unknown";
		if (label === "AGENTS.md" || label === "CLAUDE.md") {
			return label;
		}
		return `${label} only`;
	}
	return labels.join(" · ");
}

function skillRolloutOverlayLabel(artifacts: readonly SkillArtifact[]): string {
	const overlayHashes = new Set(
		artifacts
			.map((artifact) => artifact.lockfileEntry?.repoOverlayHash)
			.filter((hash): hash is string => Boolean(hash && hash !== "none")),
	);
	if (overlayHashes.size === 0) {
		return "-";
	}
	return `${overlayHashes.size} active`;
}

function skillBlueprintVersionForArtifacts(
	artifacts: readonly SkillArtifact[],
): string | undefined {
	return artifacts.find((artifact) => artifact.lockfileEntry)?.lockfileEntry
		?.blueprintVersion;
}

function skillRolloutActionForStatus(
	status: RepoSkillInventoryStatus,
): RepoSkillInventoryAction {
	if (status === "current" || status === "detected_only") {
		return "none";
	}
	return actionForRepoSkillStatus(status);
}

function skillRolloutActionLabel(row: SkillRolloutRow): string {
	if (row.status === "missing") {
		return "Install";
	}
	if (row.status === "forked") {
		return "Relink";
	}
	return repoActionLabel(row.action);
}

function skillRolloutFilterMatches(
	row: SkillRolloutRow,
	filter: SkillRolloutFilter,
): boolean {
	switch (filter) {
		case "all":
			return true;
		case "drift":
			return (
				row.status === "modified" ||
				row.status === "behind" ||
				row.status === "conflict" ||
				row.status === "forked"
			);
		case "missing":
			return row.status === "missing";
		case "unmanaged":
			return row.status === "unmanaged";
	}
}

function skillRolloutFilterCount(
	rows: readonly SkillRolloutRow[],
	filter: SkillRolloutFilter,
): number {
	return rows.filter((row) => skillRolloutFilterMatches(row, filter)).length;
}

function skillContentHasScripts(content: string): boolean {
	return /(^|\n)\s*(scripts?|commands?):|\bscripts?\//i.test(content);
}

function repoSkillStatusForArtifacts(
	artifacts: readonly SkillArtifact[],
): RepoSkillInventoryStatus {
	let selectedStatus: LockfileStatus | undefined;
	for (const artifact of artifacts) {
		const status = artifact.lockfileEntry?.status;
		if (!status) {
			continue;
		}
		if (
			!selectedStatus ||
			repoStatusRank(status) < repoStatusRank(selectedStatus)
		) {
			selectedStatus = status;
		}
	}

	if (selectedStatus) {
		return selectedStatus;
	}

	if (artifacts.some(isManagedSectionArtifact)) {
		return "detected_only";
	}

	return "unmanaged";
}

function repoSkillSourceForArtifacts(
	artifacts: readonly SkillArtifact[],
): RepoSkillInventorySource {
	if (artifacts.some(isManagedSectionArtifact)) {
		return "managed_section";
	}

	if (artifacts.some((artifact) => artifact.lockfileEntry)) {
		return "team_blueprint";
	}

	return "local_skill";
}

function sourceLabelForRepoSkill(
	source: RepoSkillInventorySource,
	artifacts: readonly SkillArtifact[],
): string {
	switch (source) {
		case "team_blueprint": {
			const version = artifacts.find((artifact) => artifact.lockfileEntry)
				?.lockfileEntry?.blueprintVersion;
			return version ? `Team blueprint ${version}` : "Team blueprint";
		}
		case "managed_section":
			return "Managed section";
		case "local_skill":
			return "Local skill";
	}
}

function isManagedSectionArtifact(artifact: SkillArtifact): boolean {
	const fileName = pathBaseName(artifact.repoRelativePath ?? artifact.path);
	return (
		artifact.artifactTarget === "agents_md" ||
		artifact.artifactTarget === "claude_md" ||
		fileName === "AGENTS.md" ||
		fileName === "CLAUDE.md"
	);
}

function overlayHashForArtifacts(
	artifacts: readonly SkillArtifact[],
): string | undefined {
	for (const artifact of artifacts) {
		const overlayHash = artifact.lockfileEntry?.repoOverlayHash;
		if (overlayHash && overlayHash !== "none") {
			return overlayHash;
		}
	}
	return undefined;
}

function repoMaterializationTargetLabels(
	artifacts: readonly SkillArtifact[],
): readonly string[] {
	const labels = new Set<string>();
	for (const artifact of artifacts) {
		labels.add(artifactTargetLabel(artifact.artifactTarget));
	}
	return [...labels].sort((left, right) => left.localeCompare(right));
}

function sortRepoSkillInventoryRows(
	left: RepoSkillInventoryRow,
	right: RepoSkillInventoryRow,
): number {
	return (
		repoStatusRank(left.status) - repoStatusRank(right.status) ||
		left.name.localeCompare(right.name)
	);
}

function repoStatusRank(status: RepoSkillInventoryStatus): number {
	switch (status) {
		case "modified":
			return 0;
		case "conflict":
			return 1;
		case "behind":
			return 2;
		case "missing":
			return 3;
		case "forked":
			return 4;
		case "unmanaged":
			return 5;
		case "current":
			return 6;
		case "detected_only":
			return 7;
	}
}

function isAttentionStatus(status: RepoSkillInventoryStatus): boolean {
	return status !== "current" && status !== "detected_only";
}

function statusLabelForRepoSkill(status: RepoSkillInventoryStatus): string {
	switch (status) {
		case "current":
			return "Current";
		case "behind":
			return "Behind";
		case "modified":
			return "Modified";
		case "missing":
			return "Missing";
		case "conflict":
			return "Conflict";
		case "forked":
			return "Forked";
		case "unmanaged":
			return "Unmanaged";
		case "detected_only":
			return "Detected only";
	}
}

function actionForRepoSkillStatus(
	status: RepoSkillInventoryStatus,
): RepoSkillInventoryAction {
	switch (status) {
		case "current":
			return "view";
		case "behind":
			return "update";
		case "modified":
		case "conflict":
		case "forked":
			return "review_drift";
		case "missing":
			return "add_section";
		case "unmanaged":
			return "adopt_ignore";
		case "detected_only":
			return "none";
	}
}

function repoActionLabel(action: RepoSkillInventoryAction): string {
	switch (action) {
		case "view":
			return "View";
		case "update":
			return "Update";
		case "review_drift":
			return "Review drift";
		case "add_section":
			return "Add section";
		case "adopt_ignore":
			return "Adopt";
		case "none":
			return "-";
	}
}

function badgeVariantForStatus(
	status: RepoSkillInventoryStatus,
): "danger" | "outline" | "secondary" | "success" | "warning" {
	switch (status) {
		case "current":
			return "success";
		case "behind":
		case "modified":
		case "forked":
			return "warning";
		case "conflict":
			return "danger";
		case "missing":
		case "unmanaged":
			return "secondary";
		case "detected_only":
			return "outline";
	}
}

function badgeVariantForSource(
	source: RepoSkillInventorySource,
): "info" | "secondary" {
	switch (source) {
		case "team_blueprint":
		case "managed_section":
			return "info";
		case "local_skill":
			return "secondary";
	}
}

function skillIconItemForArtifact(artifact: SkillArtifact): RepoSkillIconItem {
	const name = motherSkillDisplayNameForArtifact(artifact);
	const visual = skillVisualForName(name);
	return {
		id: skillArtifactKey(artifact),
		name,
		emoji: visual.emoji,
		background: visual.background,
	};
}

function skillArtifactKey(artifact: SkillArtifact): string {
	return artifact.repoRelativePath ?? artifact.path;
}

function artifactTargetLabel(
	artifactTarget: SkillArtifact["artifactTarget"],
): string {
	switch (artifactTarget) {
		case "agents_md":
			return "AGENTS.md";
		case "claude_code":
			return "Claude";
		case "claude_md":
			return "CLAUDE.md";
		case "codex":
			return "Codex";
		case "cursor":
			return "Cursor";
		case "unknown":
			return "Unknown";
	}
}

function motherSkillDisplayNameForArtifact(artifact: SkillArtifact): string {
	const relativePath = artifact.repoRelativePath ?? artifact.path;
	const outerSkillFolderName = skillRootFolderName(relativePath);
	const innerSkillFolderName = skillFolderName(relativePath);
	if (outerSkillFolderName && outerSkillFolderName !== innerSkillFolderName) {
		return outerSkillFolderName;
	}

	const fileName = pathBaseName(relativePath);
	if (fileName === "AGENTS.md" || fileName === "CLAUDE.md") {
		return fileName;
	}
	if (fileName?.endsWith(".mdc")) {
		return fileName.replace(/\.mdc$/, "");
	}

	return (
		artifact.name ??
		outerSkillFolderName ??
		innerSkillFolderName ??
		fileName ??
		"Skill"
	);
}

function skillRootFolderName(path: string): string | undefined {
	const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
	for (let index = 0; index < parts.length - 1; index += 1) {
		if (parts[index] !== "skills") {
			continue;
		}
		const folderName = parts[index + 1];
		if (folderName && folderName !== "SKILL.md") {
			return folderName;
		}
	}
	return undefined;
}

function repoVisualForRow(row: RepoOverviewRow): {
	background: string;
	emoji: string;
} {
	const normalizedLabel = row.linkLabel.toLocaleLowerCase();
	if (normalizedLabel.includes("api") || normalizedLabel.includes("test")) {
		return { emoji: "🧪", background: "#f5e8ff" };
	}
	if (normalizedLabel.includes("auth") || normalizedLabel.includes("secret")) {
		return { emoji: "🔐", background: "#e8f8ef" };
	}
	if (normalizedLabel.includes("doc") || normalizedLabel.includes("wiki")) {
		return { emoji: "📚", background: "#eef0ff" };
	}
	if (normalizedLabel.includes("infra") || normalizedLabel.includes("ops")) {
		return { emoji: "⚙️", background: "#f3ecdf" };
	}
	if (normalizedLabel.includes("mobile")) {
		return { emoji: "📱", background: "#e5f7fb" };
	}
	if (normalizedLabel.includes("ui") || normalizedLabel.includes("design")) {
		return { emoji: "🎨", background: "#fff2d8" };
	}

	const visuals = [
		{ emoji: "💻", background: "#e7f0ff" },
		{ emoji: "🧩", background: "#f1f1f1" },
		{ emoji: "📦", background: "#f3ecdf" },
		{ emoji: "🚀", background: "#ffe8ef" },
	] as const;
	return visuals[hashString(row.linkLabel) % visuals.length] ?? visuals[0];
}

function hashString(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) % 4_294_967_296;
	}
	return hash;
}

function sortDetectedSkillSources(
	left: DetectedSkillSource,
	right: DetectedSkillSource,
): number {
	return (
		left.priority - right.priority || left.label.localeCompare(right.label)
	);
}

function skillVisualForName(
	name: string,
): Pick<DetectedSkillRow, "background" | "emoji"> {
	const normalizedName = name.toLocaleLowerCase();
	if (
		normalizedName.includes("agents.md") ||
		normalizedName.includes("agent")
	) {
		return { emoji: "🤖", background: "#f1f1f1" };
	}
	if (normalizedName.includes("claude")) {
		return { emoji: "🧠", background: "#fff2d8" };
	}
	if (normalizedName.includes("cursor")) {
		return { emoji: "🎯", background: "#e8f1ff" };
	}
	if (normalizedName.includes("codex")) {
		return { emoji: "🧬", background: "#e8f1ff" };
	}
	if (normalizedName.includes("test") || normalizedName.includes("qa")) {
		return { emoji: "🧪", background: "#f5e8ff" };
	}
	if (normalizedName.includes("api")) {
		return { emoji: "🔌", background: "#e7f0ff" };
	}
	if (
		normalizedName.includes("query") ||
		normalizedName.includes("clickhouse") ||
		normalizedName.includes("postgres") ||
		normalizedName.includes("sql") ||
		normalizedName.includes("database")
	) {
		return { emoji: "🗄️", background: "#e7f0ff" };
	}
	if (normalizedName.includes("architecture")) {
		return { emoji: "🏛️", background: "#fff2d8" };
	}
	if (
		normalizedName.includes("environment") ||
		normalizedName.includes("secret")
	) {
		return { emoji: "🔐", background: "#e8f8ef" };
	}
	if (
		normalizedName.includes("doc") ||
		normalizedName.includes("library") ||
		normalizedName.includes("markdown")
	) {
		return { emoji: "📚", background: "#eef0ff" };
	}
	if (
		normalizedName.includes("pr") ||
		normalizedName.includes("github") ||
		normalizedName.includes("git")
	) {
		return { emoji: "🚢", background: "#ffe8ef" };
	}
	if (normalizedName.includes("review")) {
		return { emoji: "🔎", background: "#e7f0ff" };
	}
	if (normalizedName.includes("ui") || normalizedName.includes("design")) {
		return { emoji: "🎨", background: "#fff2d8" };
	}
	if (normalizedName.includes("browser") || normalizedName.includes("browse")) {
		return { emoji: "🌐", background: "#e5f7fb" };
	}
	if (normalizedName.includes("linear") || normalizedName.includes("plan")) {
		return { emoji: "📋", background: "#eef0ff" };
	}
	if (normalizedName.includes("image") || normalizedName.includes("video")) {
		return { emoji: "🖼️", background: "#ffe8ef" };
	}
	if (normalizedName.includes("presentation")) {
		return { emoji: "📊", background: "#eef0ff" };
	}
	if (normalizedName.includes("spreadsheet")) {
		return { emoji: "📈", background: "#e8f8ef" };
	}
	if (normalizedName.includes("openai")) {
		return { emoji: "✨", background: "#f1f1f1" };
	}
	if (normalizedName.includes("skill")) {
		return { emoji: "🧩", background: "#f1f1f1" };
	}
	if (normalizedName.includes("rust")) {
		return { emoji: "⚙️", background: "#f3ecdf" };
	}
	if (normalizedName.includes("tauri")) {
		return { emoji: "🖥️", background: "#e5f7fb" };
	}
	if (normalizedName.includes("typescript")) {
		return { emoji: "🟦", background: "#e8f1ff" };
	}
	return fallbackSkillVisual(name);
}

function fallbackSkillVisual(
	name: string,
): Pick<DetectedSkillRow, "background" | "emoji"> {
	const visuals = [
		{ emoji: "🧩", background: "#f1f1f1" },
		{ emoji: "🛠️", background: "#f3ecdf" },
		{ emoji: "📌", background: "#ffe8ef" },
		{ emoji: "💡", background: "#fff2d8" },
		{ emoji: "🧭", background: "#e7f0ff" },
	] as const;
	return visuals[hashString(name) % visuals.length] ?? visuals[0];
}

const styles = {
	shell: {
		width: "100%",
		height: "100%",
		minWidth: 0,
		minHeight: 0,
		boxSizing: "border-box",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		background: "#ffffff",
		color: "#050505",
		fontFamily:
			'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11", "ss01"',
		overflow: "hidden",
		padding: "24px 24px 32px",
	} satisfies CSSProperties,
	dashboardShell: {
		width: "100%",
		height: "100%",
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
		background: "#ffffff",
		color: "#050505",
		fontFamily:
			'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
		fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11", "ss01"',
		overflow: "hidden",
	} satisfies CSSProperties,
	dashboardTopBar: {
		flex: `0 0 ${titlebarHeight}px`,
		height: titlebarHeight,
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		background: "#ffffff",
		display: "flex",
		alignItems: "stretch",
		gap: titlebarGap,
		padding: "0 16px 0 0",
		WebkitUserSelect: "none",
		userSelect: "none",
	} satisfies CSSProperties,
	titlebarControlSpace: {
		width: trafficLightControlSpaceWidth,
		height: "100%",
		flex: "0 0 auto",
	} satisfies CSSProperties,
	dashboardTitle: {
		minWidth: 0,
		height: "100%",
		display: "flex",
		alignItems: "flex-end",
		flex: "0 1 auto",
		color: "#050505",
		fontSize: 14,
		fontWeight: 500,
		lineHeight: "20px",
		paddingBottom: titlebarTextBottomInset,
	} satisfies CSSProperties,
	titlebarDragFill: {
		minWidth: 0,
		height: "100%",
		flex: "1 1 auto",
	} satisfies CSSProperties,
	dashboardContent: {
		flex: "1 1 auto",
		minWidth: 0,
		minHeight: 0,
		overflow: "auto",
		padding: "0 20px 20px",
	} satisfies CSSProperties,
	dashboardTable: {
		tableLayout: "fixed",
	} satisfies CSSProperties,
	dashboardRepoTable: {
		tableLayout: "auto",
	} satisfies CSSProperties,
	dashboardTableRight: {
		width: 140,
		color: "#737373",
		textAlign: "right",
	} satisfies CSSProperties,
	dashboardSkillIconCell: {
		width: "1%",
		paddingLeft: 18,
		textAlign: "right",
	} satisfies CSSProperties,
	dashboardSkillIconAligner: {
		minWidth: 0,
		display: "flex",
		justifyContent: "flex-end",
	} satisfies CSSProperties,
	dashboardTabsBar: {
		position: "sticky",
		top: 0,
		zIndex: 2,
		margin: "0 -20px",
		minHeight: 52,
		display: "flex",
		alignItems: "center",
		padding: "0 20px",
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		background: "#ffffff",
	} satisfies CSSProperties,
	dashboardRepoLine: {
		minWidth: 0,
		flex: "1 1 auto",
		display: "flex",
		alignItems: "center",
		gap: 10,
	} satisfies CSSProperties,
	dashboardRepoText: {
		minWidth: 0,
		display: "flex",
		alignItems: "baseline",
		gap: 8,
	} satisfies CSSProperties,
	repoInlineMeta: {
		minWidth: 0,
		color: "#737373",
		fontSize: 12,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	skillIconStack: {
		minWidth: "max-content",
		minInlineSize: 0,
		flex: "0 0 auto",
		border: 0,
		margin: "0 0 0 auto",
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		padding: 0,
	} satisfies CSSProperties,
	skillStackIcon: {
		position: "relative",
		width: 26,
		height: 26,
		border: "1px solid #ffffff",
		borderRadius: 999,
		boxShadow: "0 1px 2px rgba(5, 5, 5, 0.08)",
		color: "#171717",
		cursor: "default",
		display: "grid",
		flex: "0 0 auto",
		font: "inherit",
		fontSize: 13,
		fontWeight: 650,
		letterSpacing: 0,
		margin: 0,
		padding: 0,
		placeItems: "center",
		transition:
			"transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
	} satisfies CSSProperties,
	dashboardMessage: {
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
	} satisfies CSSProperties,
	panel: {
		flex: "1 1 auto",
		minHeight: 0,
		minWidth: 0,
		width: "min(100%, 520px)",
		display: "flex",
		flexDirection: "column",
		justifyContent: "center",
		gap: 28,
	} satisfies CSSProperties,
	stepper: {
		flex: "0 0 auto",
		margin: 0,
		padding: 0,
		display: "flex",
		justifyContent: "center",
		gap: 8,
		listStyle: "none",
	} satisfies CSSProperties,
	step: {
		width: 28,
		height: 28,
		borderRadius: 999,
		border: "1px solid rgba(5, 5, 5, 0.14)",
		display: "grid",
		placeItems: "center",
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		fontVariantNumeric: "tabular-nums",
	} satisfies CSSProperties,
	stepActive: {
		borderColor: "#050505",
		background: "#050505",
		color: "#ffffff",
	} satisfies CSSProperties,
	content: {
		flex: "1 1 auto",
		minHeight: 0,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		textAlign: "center",
	} satisfies CSSProperties,
	title: {
		maxWidth: 420,
		margin: 0,
		color: "#050505",
		fontSize: 28,
		lineHeight: 1.15,
		fontWeight: 500,
		letterSpacing: 0,
	} satisfies CSSProperties,
	titleNumber: {
		fontVariantNumeric: "tabular-nums",
	} satisfies CSSProperties,
	description: {
		maxWidth: 380,
		margin: 0,
		color: "#737373",
		fontSize: 16,
		lineHeight: 1.55,
	} satisfies CSSProperties,
	scanMessage: {
		marginTop: 10,
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
	} satisfies CSSProperties,
	skillTableWrap: {
		width: "100%",
		minHeight: 0,
		maxHeight: "min(248px, 34svh)",
		marginTop: 10,
		overflow: "auto",
	} satisfies CSSProperties,
	skillTable: {
		tableLayout: "fixed",
	} satisfies CSSProperties,
	skillNameCell: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 10,
	} satisfies CSSProperties,
	skillEmoji: {
		width: 30,
		height: 30,
		borderRadius: 10,
		display: "grid",
		placeItems: "center",
		color: "#171717",
		fontSize: 14,
		fontWeight: 650,
		flex: "0 0 auto",
	} satisfies CSSProperties,
	skillDetailPage: {
		flex: "1 1 auto",
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
		margin: "0 -20px -20px",
	} satisfies CSSProperties,
	skillHero: {
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 18,
		padding: "28px 40px 26px",
	} satisfies CSSProperties,
	skillHeroText: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 8,
	} satisfies CSSProperties,
	skillHeroTitleRow: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	} satisfies CSSProperties,
	skillHeroTitle: {
		margin: 0,
		color: "#050505",
		fontSize: 30,
		fontWeight: 600,
		letterSpacing: 0,
		lineHeight: 1.15,
	} satisfies CSSProperties,
	skillHeroSummary: {
		margin: 0,
		color: "#525252",
		fontSize: 15,
		fontWeight: 500,
		lineHeight: 1.45,
	} satisfies CSSProperties,
	skillHeroChips: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 4,
	} satisfies CSSProperties,
	skillHeroActions: {
		flex: "0 0 auto",
		display: "flex",
		alignItems: "center",
		gap: 8,
	} satisfies CSSProperties,
	skillHeaderButton: {
		minHeight: 34,
		borderRadius: 8,
	} satisfies CSSProperties,
	skillHeaderWarningButton: {
		minHeight: 34,
		borderRadius: 8,
		borderColor: "rgba(138, 90, 0, 0.18)",
		background: "#fff2d8",
		color: "#8a5a00",
	} satisfies CSSProperties,
	skillDetailTabs: {
		flex: "1 1 auto",
		minHeight: 0,
		gap: 0,
	} satisfies CSSProperties,
	skillTabsBar: {
		position: "sticky",
		top: 0,
		zIndex: 1,
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		background: "#ffffff",
		display: "flex",
		alignItems: "center",
		minHeight: 52,
		padding: "0 40px",
	} satisfies CSSProperties,
	skillDetailTab: {
		minHeight: 52,
		border: 0,
		borderBottom: "2px solid transparent",
		borderRadius: 0,
		background: "transparent",
		boxShadow: "none",
		color: "#737373",
		fontSize: 15,
		padding: "0 18px",
	} satisfies CSSProperties,
	skillDetailTabActive: {
		borderBottomColor: "#050505",
		background: "transparent",
		boxShadow: "none",
		color: "#050505",
	} satisfies CSSProperties,
	breadcrumb: {
		minWidth: 0,
		height: "20px",
		display: "flex",
		alignItems: "center",
		gap: 4,
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
		lineHeight: "20px",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	breadcrumbButton: {
		color: "#525252",
		lineHeight: "20px",
	} satisfies CSSProperties,
	breadcrumbSeparator: {
		color: "#a3a3a3",
		lineHeight: "20px",
	} satisfies CSSProperties,
	breadcrumbCurrent: {
		minWidth: 0,
		color: "#171717",
		lineHeight: "20px",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	skillDetail: {
		width: "min(100%, 840px)",
		minHeight: 0,
		flex: "1 1 auto",
		display: "flex",
		flexDirection: "column",
		gap: 12,
	} satisfies CSSProperties,
	skillDefinitionPanel: {
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flex: "1 1 auto",
		flexDirection: "column",
		gap: 12,
		padding: "22px 40px 30px",
	} satisfies CSSProperties,
	skillDetailHeader: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 9,
	} satisfies CSSProperties,
	skillDetailEmoji: {
		width: 30,
		height: 30,
		borderRadius: 8,
		display: "grid",
		placeItems: "center",
		color: "#171717",
		fontSize: 14,
		fontWeight: 650,
		flex: "0 0 auto",
	} satisfies CSSProperties,
	skillDetailMeta: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 1,
	} satisfies CSSProperties,
	skillDetailSource: {
		minWidth: 0,
		color: "#171717",
		fontSize: 13,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	skillDetailSummary: {
		margin: 0,
		color: "#737373",
		fontSize: 12,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	skillContent: {
		width: "100%",
		minHeight: 0,
		flex: "1 1 auto",
		maxHeight: "calc(100svh - 278px)",
		margin: 0,
		border: "1px solid rgba(5, 5, 5, 0.08)",
		borderRadius: 8,
		background: "#fbfbfb",
		color: "#171717",
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 13,
		lineHeight: 1.6,
		overflow: "auto",
		padding: 16,
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	} satisfies CSSProperties,
	rolloutsPage: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 26,
		padding: "28px 40px 32px",
	} satisfies CSSProperties,
	rolloutFilterBar: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 10,
	} satisfies CSSProperties,
	rolloutFilterCount: {
		color: "#737373",
		fontVariantNumeric: "tabular-nums",
	} satisfies CSSProperties,
	hardcodedRolloutText: {
		color: "#123a73",
	} satisfies CSSProperties,
	rolloutRepoName: {
		minWidth: 0,
		color: "#171717",
		fontSize: 15,
		fontWeight: 600,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	rolloutRepoIdentity: {
		marginTop: 3,
		color: "#737373",
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 12,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	rolloutRepoLocalIdentity: {
		marginTop: 3,
		color: "#737373",
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 12,
		fontStyle: "italic",
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	rolloutHardcodedCell: {
		color: "#123a73",
		overflow: "hidden",
		textOverflow: "ellipsis",
	} satisfies CSSProperties,
	rolloutCopiesCell: {
		color: "#525252",
		fontVariantNumeric: "tabular-nums",
		textAlign: "right",
	} satisfies CSSProperties,
	rolloutSegmentedAction: {
		marginLeft: "auto",
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
	} satisfies CSSProperties,
	rolloutNoAction: {
		fontSize: 15,
		fontWeight: 500,
	} satisfies CSSProperties,
	rolloutEmptyState: {
		border: "1px solid rgba(5, 5, 5, 0.08)",
		borderRadius: 8,
		background: "#fbfbfb",
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
		padding: 16,
	} satisfies CSSProperties,
	repoDetailPage: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 0,
		margin: "0 -20px -20px",
	} satisfies CSSProperties,
	repoHero: {
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		display: "flex",
		flexDirection: "column",
		gap: 22,
		padding: "28px 40px 26px",
	} satisfies CSSProperties,
	repoHeroTop: {
		minWidth: 0,
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 18,
	} satisfies CSSProperties,
	repoHeroIdentity: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 7,
	} satisfies CSSProperties,
	repoEyebrow: {
		minWidth: 0,
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoTitleRow: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
	} satisfies CSSProperties,
	repoDetailTitle: {
		margin: 0,
		color: "#050505",
		fontSize: 30,
		fontWeight: 600,
		letterSpacing: 0,
	} satisfies CSSProperties,
	repoDetailPath: {
		maxWidth: "72ch",
		margin: 0,
		color: "#525252",
		fontSize: 15,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoMetaList: {
		margin: "6px 0 0",
		padding: 0,
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: "10px 20px",
		listStyle: "none",
	} satisfies CSSProperties,
	repoMetaItem: {
		display: "inline-flex",
		alignItems: "center",
		gap: 7,
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoMetaDot: {
		width: 7,
		height: 7,
		border: "1px solid rgba(5, 5, 5, 0.24)",
		borderRadius: 2,
		flex: "0 0 auto",
	} satisfies CSSProperties,
	repoHeroActions: {
		flex: "0 0 auto",
		display: "flex",
		alignItems: "center",
		gap: 8,
	} satisfies CSSProperties,
	repoSummaryGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
		gap: 14,
	} satisfies CSSProperties,
	repoSummaryStat: {
		minWidth: 0,
		border: "1px solid rgba(5, 5, 5, 0.08)",
		borderRadius: 8,
		background: "#fbfbfb",
		display: "flex",
		flexDirection: "column",
		gap: 8,
		padding: 16,
	} satisfies CSSProperties,
	repoSummaryStatWarning: {
		background: "#fffaf0",
		borderColor: "rgba(138, 90, 0, 0.18)",
	} satisfies CSSProperties,
	repoSummaryLabel: {
		color: "#737373",
		fontSize: 12,
		fontWeight: 700,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	} satisfies CSSProperties,
	repoSummaryValueRow: {
		minWidth: 0,
		display: "flex",
		alignItems: "baseline",
		gap: 8,
	} satisfies CSSProperties,
	repoSummaryValue: {
		color: "#050505",
		fontSize: 28,
		fontWeight: 600,
		fontVariantNumeric: "tabular-nums",
	} satisfies CSSProperties,
	repoSummaryDetail: {
		minWidth: 0,
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoSection: {
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		display: "flex",
		flexDirection: "column",
		gap: 14,
		padding: "26px 40px 30px",
	} satisfies CSSProperties,
	repoSectionHeader: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	} satisfies CSSProperties,
	repoSectionTitleGroup: {
		minWidth: 0,
		display: "flex",
		alignItems: "baseline",
		gap: 10,
	} satisfies CSSProperties,
	repoSectionTitle: {
		margin: 0,
		color: "#050505",
		fontSize: 20,
		fontWeight: 600,
		letterSpacing: 0,
	} satisfies CSSProperties,
	repoSectionCount: {
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
		fontVariantNumeric: "tabular-nums",
	} satisfies CSSProperties,
	repoInventoryNameCell: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 8,
	} satisfies CSSProperties,
	repoInventoryName: {
		minWidth: 0,
		color: "#171717",
		fontSize: 15,
		fontWeight: 600,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoInventoryTargets: {
		marginTop: 4,
		color: "#737373",
		fontSize: 12,
		fontWeight: 500,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoSegmentedAction: {
		marginLeft: "auto",
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
	} satisfies CSSProperties,
	repoNoAction: {
		color: "#a3a3a3",
		fontSize: 15,
		fontWeight: 500,
	} satisfies CSSProperties,
	repoEmptyState: {
		border: "1px solid rgba(5, 5, 5, 0.08)",
		borderRadius: 8,
		background: "#fbfbfb",
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
		padding: 16,
	} satisfies CSSProperties,
	repoOverlayPanel: {
		border: "1px solid rgba(5, 5, 5, 0.1)",
		borderRadius: 8,
		overflow: "hidden",
	} satisfies CSSProperties,
	repoOverlayRow: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		padding: 16,
	} satisfies CSSProperties,
	repoOverlayTitle: {
		color: "#171717",
		fontSize: 15,
		fontWeight: 600,
	} satisfies CSSProperties,
	repoOverlayMeta: {
		marginTop: 4,
		color: "#737373",
		fontSize: 14,
		fontWeight: 500,
	} satisfies CSSProperties,
	repoOverlayActions: {
		display: "flex",
		alignItems: "center",
		gap: 8,
	} satisfies CSSProperties,
	repoMaterializationPanel: {
		margin: "30px 40px",
		border: "1px solid rgba(5, 5, 5, 0.1)",
		borderRadius: 8,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		padding: "18px 20px",
	} satisfies CSSProperties,
	repoMaterializationText: {
		minWidth: 0,
	} satisfies CSSProperties,
	repoDetailFooter: {
		borderTop: "1px solid rgba(5, 5, 5, 0.08)",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		padding: "16px 40px 20px",
	} satisfies CSSProperties,
	tableHeadRight: {
		width: 132,
		textAlign: "right",
	} satisfies CSSProperties,
	tableCellRight: {
		width: 132,
		maxWidth: 132,
		color: "#737373",
		textAlign: "right",
	} satisfies CSSProperties,
	sourceLabel: {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		maxWidth: 132,
		marginLeft: "auto",
		minWidth: 0,
		textAlign: "right",
	} satisfies CSSProperties,
	sourcePrimaryLabel: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		direction: "rtl",
		textAlign: "right",
	} satisfies CSSProperties,
	sourceCount: {
		flex: "0 0 auto",
		whiteSpace: "nowrap",
		fontVariantNumeric: "tabular-nums",
	} satisfies CSSProperties,
	repoTableWrap: {
		width: "100%",
		minHeight: 0,
		maxHeight: "min(284px, 38svh)",
		marginTop: 10,
		overflow: "auto",
	} satisfies CSSProperties,
	repoTable: {
		tableLayout: "fixed",
	} satisfies CSSProperties,
	repoSelectHead: {
		width: 30,
	} satisfies CSSProperties,
	repoSelectCell: {
		width: 30,
		paddingRight: 8,
	} satisfies CSSProperties,
	repoTitleCell: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 10,
	} satisfies CSSProperties,
	repoEmoji: {
		width: 30,
		height: 30,
		borderRadius: 10,
		display: "grid",
		placeItems: "center",
		color: "#171717",
		fontSize: 14,
		fontWeight: 650,
		flex: "0 0 auto",
	} satisfies CSSProperties,
	repoNameCell: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-start",
		gap: 3,
		textAlign: "left",
	} satisfies CSSProperties,
	repoTitleText: {
		maxWidth: "100%",
		color: "#171717",
		fontSize: 13,
		fontWeight: 500,
		textDecoration: "none",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	visuallyHidden: {
		position: "absolute",
		width: 1,
		height: 1,
		padding: 0,
		margin: -1,
		overflow: "hidden",
		clip: "rect(0, 0, 0, 0)",
		whiteSpace: "nowrap",
		border: 0,
	} satisfies CSSProperties,
	footer: {
		flex: "0 0 auto",
		display: "flex",
		justifyContent: "center",
		gap: 8,
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
