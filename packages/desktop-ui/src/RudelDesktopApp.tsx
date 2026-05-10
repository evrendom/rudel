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
type SkillDefinitionViewMode = "beautified" | "md";

type DashboardPage =
	| { screen: "overview" }
	| { screen: "skill"; repoId?: string; skillId: string }
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

export type ParsedSkillDocument = {
	frontmatter: SkillFrontmatter;
	body: string;
};

export type MarkdownBlock =
	| { code: string; language: string | undefined; type: "code" }
	| { depth: 1 | 2 | 3 | 4; text: string; type: "heading" }
	| { items: readonly string[]; ordered: boolean; type: "list" }
	| {
			rows: readonly (readonly string[])[];
			headers: readonly string[];
			type: "table";
	  }
	| { text: string; type: "blockquote" }
	| { text: string; type: "paragraph" }
	| { type: "rule" };

type SkillFrontmatter = {
	name: string | undefined;
	description: string | undefined;
	allowedTools: readonly string[];
};

export type RepoSkillIconItem = {
	id: string;
	name: string;
	emoji: string;
	background: string;
	skillId?: string;
};

type RepoSkillInventoryStatus = LockfileStatus | "detected_only";

type RepoSkillInventorySource =
	| "team_blueprint"
	| "managed_section"
	| "local_skill";

export type RepoSkillInventoryRow = {
	id: string;
	name: string;
	emoji: string;
	background: string;
	status: RepoSkillInventoryStatus;
	statusLabel: string;
	source: RepoSkillInventorySource;
	sourceLabel: string;
	syncingLabel: string;
	syncingDescription: string;
	syncingEvidence: string;
	targetLabels: readonly string[];
	skillId: string | undefined;
	overlayHash: string | undefined;
	hasOverlay: boolean;
	copyCount: number;
};

export type RepoAlwaysLoadedMarkdownFile = {
	id: string;
	path: string;
	targetLabel: string;
	characterCount: number;
	fileCount: number;
};

export type SkillRolloutRow = {
	id: string;
	repoId?: string;
	repoName: string;
	emoji: string;
	background: string;
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
const skillDefinitionViewOptions = [
	{ label: "Beautified", value: "beautified" },
	{ label: "MD", value: "md" },
] as const satisfies readonly {
	label: string;
	value: SkillDefinitionViewMode;
}[];

const titlebarHeight = 33;
const titlebarGap = 10;
const trafficLightControlSpaceWidth = 78;
const fullscreenTitlebarInset = 16;
const titlebarTextBottomInset = 4;
const trafficLightTitlebarTextBottomInset = titlebarTextBottomInset + 2;
const maxVisibleRepoSkillIcons = 20;

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

	function openSkillPage(skillId: string, repoId?: string) {
		setDashboardDefaultTab("skills");
		setDashboardPage(
			repoId
				? { screen: "skill", repoId, skillId }
				: { screen: "skill", skillId },
		);
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
		const activeRepoId =
			dashboardPage.screen === "repo"
				? dashboardPage.repoId
				: dashboardPage.screen === "skill"
					? dashboardPage.repoId
					: undefined;
		const dashboardRepoRows = includeActiveRepoRow(
			selectedRepoRows.length > 0 ? selectedRepoRows : repoScanState.rows,
			repoScanState.rows,
			activeRepoId,
		);

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
							onOpenRepo={openRepoPage}
							repoRows={repoScanState.rows}
							skillScanState={skillScanState}
						/>
					) : null}
					{activeStepIndex === 3 ? (
						<RepositorySelection
							onOpenRepo={openRepoPage}
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
	onOpenRepo: (repoId: string) => void;
	repoRows: readonly RepoOverviewRow[];
	skillScanState: SkillScanState;
};

type DashboardProps = {
	defaultTab: DashboardTab;
	onOpenRepo: (repoId: string) => void;
	onOpenSkill: (skillId: string, repoId?: string) => void;
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

export type DashboardBreadcrumbItem = {
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
	const selectedSkillRepo =
		props.page.screen === "skill" && props.page.repoId
			? repoRowForId(props.repoRows, props.page.repoId)
			: undefined;
	const breadcrumbItems = dashboardBreadcrumbItems({
		onOpenRepo: props.onOpenRepo,
		onShowMain: props.onShowMain,
		onShowRepos: props.onShowRepos,
		onShowSkills: props.onShowSkills,
		selectedRepo,
		selectedSkill,
		selectedSkillRepo,
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
						onOpenRepo={props.onOpenRepo}
						repoRows={props.repoScanState.rows}
						skill={selectedSkill}
						skillArtifacts={props.skillArtifacts}
					/>
				) : selectedRepo ? (
					<RepoDetailPage
						onOpenSkill={(skillId) =>
							props.onOpenSkill(skillId, selectedRepo.id)
						}
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
								onOpenSkill={props.onOpenSkill}
								repoRows={props.repoRows}
								repoScanState={props.repoScanState}
								skillArtifacts={props.skillArtifacts}
								skillRows={props.skillRows}
							/>
						</TabsContent>
						<TabsContent value="skills">
							<DashboardSkillsTable
								onOpenRepo={props.onOpenRepo}
								onOpenSkill={props.onOpenSkill}
								repoRows={props.repoScanState.rows}
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
	onOpenSkill: (skillId: string, repoId?: string) => void;
	repoRows: readonly RepoOverviewRow[];
	repoScanState: RepoScanState;
	skillArtifacts: readonly SkillArtifact[];
	skillRows: readonly DetectedSkillRow[];
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
							props.skillRows,
						);
						const displaySkillCount =
							props.skillArtifacts.length === 0
								? row.skillFileCount
								: skillIcons.length;
						return (
							<TableRow key={row.id}>
								<TableCell style={styles.dashboardRepoCell}>
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
										<SkillIconStack
											onOpenSkill={props.onOpenSkill}
											repoId={row.id}
											skills={skillIcons}
										/>
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
	onOpenSkill: (skillId: string, repoId?: string) => void;
	repoId?: string;
	skills: readonly RepoSkillIconItem[];
};

function SkillIconStack(props: SkillIconStackProps): ReactElement | null {
	const [activeSkillId, setActiveSkillId] = useState<string | undefined>();

	if (props.skills.length === 0) {
		return null;
	}

	const activeIndex = activeSkillId
		? props.skills
				.slice(0, maxVisibleRepoSkillIcons)
				.findIndex((skill) => skill.id === activeSkillId)
		: -1;
	const visibleSkills = props.skills.slice(0, maxVisibleRepoSkillIcons);
	const hiddenSkillCount = Math.max(
		props.skills.length - maxVisibleRepoSkillIcons,
		0,
	);

	return (
		<fieldset style={styles.skillIconStack} aria-label="Repo skills">
			{visibleSkills.map((skill, index) => {
				const skillId = skill.skillId;
				return (
					<Tooltip key={skill.id}>
						<TooltipTrigger
							aria-label={skillId ? `Open ${skill.name}` : skill.name}
							onBlur={() => setActiveSkillId(undefined)}
							onClick={
								skillId
									? () => props.onOpenSkill(skillId, props.repoId)
									: undefined
							}
							onFocus={() => setActiveSkillId(skill.id)}
							onPointerEnter={() => setActiveSkillId(skill.id)}
							onPointerLeave={() => setActiveSkillId(undefined)}
							style={skillStackIconStyle(
								skill,
								index,
								activeIndex,
								Boolean(skillId),
							)}
						>
							{skill.emoji}
						</TooltipTrigger>
						<TooltipContent>{skill.name}</TooltipContent>
					</Tooltip>
				);
			})}
			{hiddenSkillCount > 0 ? (
				<span
					style={styles.skillStackMoreBadge}
					title={`${hiddenSkillCount} more skills`}
				>
					<span aria-hidden="true">+{hiddenSkillCount}</span>
					<span style={styles.visuallyHidden}>
						{hiddenSkillCount} more skills
					</span>
				</span>
			) : null}
		</fieldset>
	);
}

type DashboardSkillsTableProps = {
	onOpenRepo: (repoId: string) => void;
	onOpenSkill: (skillId: string) => void;
	repoRows: readonly RepoOverviewRow[];
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
							<SkillSourceLabel
								label={skill.sourceLabel}
								onOpenRepo={props.onOpenRepo}
								repoRows={props.repoRows}
								skill={skill}
							/>
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
								<SkillSourceLabel
									label={skill.sourceLabel}
									onOpenRepo={props.onOpenRepo}
									repoRows={props.repoRows}
									skill={skill}
								/>
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

type SkillSourceLabelProps = {
	label: string;
	onOpenRepo: (repoId: string) => void;
	repoRows: readonly RepoOverviewRow[];
	skill: DetectedSkillRow;
};

function SkillSourceLabel(props: SkillSourceLabelProps): ReactElement {
	const repo = primaryRepoRowForSkillSource(props.skill, props.repoRows);
	const sourceLabel = (
		<span style={styles.sourcePrimaryLabel}>{props.label}</span>
	);

	if (!repo) {
		return (
			<span title={props.label} style={styles.sourceLabel}>
				{sourceLabel}
			</span>
		);
	}

	return (
		<Button
			aria-label={`Open ${repo.displayName}`}
			onClick={() => props.onOpenRepo(repo.id)}
			size="xs"
			style={styles.sourceLink}
			title={props.label}
			variant="link"
		>
			{sourceLabel}
		</Button>
	);
}

export type DashboardBreadcrumbItemsInput = {
	onOpenRepo: (repoId: string) => void;
	onShowMain: () => void;
	onShowRepos: () => void;
	onShowSkills: () => void;
	selectedRepo: RepoOverviewRow | undefined;
	selectedSkill: DetectedSkillRow | undefined;
	selectedSkillRepo: RepoOverviewRow | undefined;
};

export function dashboardBreadcrumbItems(
	input: DashboardBreadcrumbItemsInput,
): readonly DashboardBreadcrumbItem[] {
	if (input.selectedSkill && input.selectedSkillRepo) {
		const repo = input.selectedSkillRepo;
		return [
			{ key: "main", label: "Main", onSelect: input.onShowMain },
			{ key: "repos", label: "Repos", onSelect: input.onShowRepos },
			{
				key: repo.id,
				label: repo.displayName,
				onSelect: () => input.onOpenRepo(repo.id),
			},
			{
				key: `skill:${input.selectedSkill.id}`,
				label: input.selectedSkill.name,
			},
		];
	}

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
	onOpenRepo: (repoId: string) => void;
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
	const skillDocument = parseSkillDocument(props.skill.content);
	const heroName = skillDocument.frontmatter.name ?? props.skill.name;
	const hasHeroMetadata = skillFrontmatterHasDetails(skillDocument.frontmatter);

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
						<div style={styles.skillHeroCopy}>
							<h1 id="skill-detail-title" style={styles.skillHeroTitle}>
								{heroName}
							</h1>
							{hasHeroMetadata ? (
								<SkillFrontmatterBlock
									frontmatter={skillDocument.frontmatter}
								/>
							) : null}
						</div>
					</div>
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
							Definition
						</TabsTrigger>
						<TabsTrigger style={skillDetailTabStyle} value="rollouts">
							Rollouts
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent value="definition">
					<SkillDefinitionPanel
						content={skillDocument.body}
						skillName={heroName}
					/>
				</TabsContent>
				<TabsContent value="rollouts">
					<SkillRolloutsPanel
						onOpenRepo={props.onOpenRepo}
						rows={rolloutRows}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}

type SkillFrontmatterBlockProps = {
	frontmatter: SkillFrontmatter;
};

function SkillFrontmatterBlock(
	props: SkillFrontmatterBlockProps,
): ReactElement {
	const description = props.frontmatter.description?.trim();
	const allowedTools = props.frontmatter.allowedTools
		.map((tool) => tool.trim())
		.filter((tool) => tool.length > 0);

	return (
		<div style={styles.skillHeroFrontmatter}>
			{description ? (
				<p style={styles.skillHeroDescription}>{description}</p>
			) : null}
			{allowedTools.length > 0 ? (
				<div style={styles.skillHeroTools}>
					<span style={styles.skillHeroToolsLabel}>Allowed tools</span>
					{allowedTools.map((tool) => (
						<Badge
							key={tool}
							style={styles.skillHeroToolBadge}
							variant="secondary"
						>
							{tool}
						</Badge>
					))}
				</div>
			) : null}
		</div>
	);
}

function skillFrontmatterHasDetails(frontmatter: SkillFrontmatter): boolean {
	return (
		Boolean(frontmatter.description?.trim()) ||
		frontmatter.allowedTools.some((tool) => tool.trim().length > 0)
	);
}

type SkillDefinitionPanelProps = {
	content: string;
	skillName: string;
};

function SkillDefinitionPanel(props: SkillDefinitionPanelProps): ReactElement {
	const [viewMode, setViewMode] =
		useState<SkillDefinitionViewMode>("beautified");
	const content =
		props.content.trim().length > 0
			? props.content
			: "No content available for this skill.";

	return (
		<section
			aria-label={`${props.skillName} definition`}
			style={styles.skillDefinitionPanel}
		>
			<div style={styles.skillDefinitionToolbar}>
				<SkillDefinitionViewToggle
					onValueChange={setViewMode}
					value={viewMode}
				/>
			</div>
			{viewMode === "beautified" ? (
				<MarkdownDocument content={content} />
			) : (
				<pre style={styles.skillContent}>{content}</pre>
			)}
		</section>
	);
}

type SkillDefinitionViewToggleProps = {
	onValueChange: (value: SkillDefinitionViewMode) => void;
	value: SkillDefinitionViewMode;
};

function SkillDefinitionViewToggle(
	props: SkillDefinitionViewToggleProps,
): ReactElement {
	return (
		<fieldset
			aria-label="Definition display mode"
			style={styles.skillDefinitionToggle}
		>
			{skillDefinitionViewOptions.map((option) => {
				const isActive = option.value === props.value;
				return (
					<Button
						aria-pressed={isActive}
						key={option.value}
						onClick={() => props.onValueChange(option.value)}
						size="xs"
						style={skillDefinitionToggleButtonStyle(isActive)}
						variant="ghost"
					>
						{option.label}
					</Button>
				);
			})}
		</fieldset>
	);
}

type MarkdownDocumentProps = {
	content: string;
};

function MarkdownDocument(props: MarkdownDocumentProps): ReactElement {
	const blocks = parseMarkdownBlocks(props.content);

	return (
		<article style={styles.markdownDocument}>
			{blocks.map((block, index) => renderMarkdownBlock(block, index))}
		</article>
	);
}

function renderMarkdownBlock(
	block: MarkdownBlock,
	index: number,
): ReactElement {
	switch (block.type) {
		case "heading":
			return renderMarkdownHeading(block, index);
		case "paragraph":
			return (
				<p key={index} style={styles.markdownParagraph}>
					{renderInlineMarkdown(block.text, `paragraph-${index}`)}
				</p>
			);
		case "blockquote":
			return (
				<blockquote key={index} style={styles.markdownBlockquote}>
					{renderInlineMarkdown(block.text, `blockquote-${index}`)}
				</blockquote>
			);
		case "list":
			return renderMarkdownList(block, index);
		case "table":
			return renderMarkdownTable(block, index);
		case "code":
			return (
				<pre key={index} style={styles.markdownCodeBlock}>
					<code>{block.code}</code>
				</pre>
			);
		case "rule":
			return <hr key={index} style={styles.markdownRule} />;
	}
}

function renderMarkdownHeading(
	block: Extract<MarkdownBlock, { type: "heading" }>,
	index: number,
): ReactElement {
	const headingStyle = markdownHeadingStyle(block.depth);
	const children = renderInlineMarkdown(block.text, `heading-${index}`);
	if (block.depth === 1) {
		return (
			<h1 key={index} style={headingStyle}>
				{children}
			</h1>
		);
	}
	if (block.depth === 2) {
		return (
			<h2 key={index} style={headingStyle}>
				{children}
			</h2>
		);
	}
	if (block.depth === 3) {
		return (
			<h3 key={index} style={headingStyle}>
				{children}
			</h3>
		);
	}
	return (
		<h4 key={index} style={headingStyle}>
			{children}
		</h4>
	);
}

function renderMarkdownList(
	block: Extract<MarkdownBlock, { type: "list" }>,
	index: number,
): ReactElement {
	const ListTag = block.ordered ? "ol" : "ul";
	const itemKeys = new Map<string, number>();
	return (
		<ListTag key={index} style={styles.markdownList}>
			{block.items.map((item) => {
				const itemKey = repeatedContentKey(`list-${index}`, item, itemKeys);
				return (
					<li key={itemKey} style={styles.markdownListItem}>
						{renderInlineMarkdown(item, itemKey)}
					</li>
				);
			})}
		</ListTag>
	);
}

function renderMarkdownTable(
	block: Extract<MarkdownBlock, { type: "table" }>,
	index: number,
): ReactElement {
	const headerKeys = new Map<string, number>();
	const rowKeys = new Map<string, number>();
	return (
		<Table key={index} aria-label="Markdown table" variant="panel">
			<TableHeader>
				<TableRow>
					{block.headers.map((header) => {
						const headerKey = repeatedContentKey(
							`table-${index}-header`,
							header,
							headerKeys,
						);
						return (
							<TableHead key={headerKey}>
								{renderInlineMarkdown(header, headerKey)}
							</TableHead>
						);
					})}
				</TableRow>
			</TableHeader>
			<TableBody>
				{block.rows.map((row) => {
					const rowKey = repeatedContentKey(
						`table-${index}-row`,
						row.join("\u001f"),
						rowKeys,
					);
					const cellKeys = new Map<string, number>();
					return (
						<TableRow key={rowKey}>
							{block.headers.map((_, cellIndex) => {
								const cell = row[cellIndex] ?? "";
								const cellKey = repeatedContentKey(
									`${rowKey}-cell`,
									cell,
									cellKeys,
								);
								return (
									<TableCell key={cellKey}>
										{renderInlineMarkdown(cell, cellKey)}
									</TableCell>
								);
							})}
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

function renderInlineMarkdown(
	text: string,
	keyPrefix: string,
): readonly ReactElement[] | string {
	const tokens = tokenizeInlineMarkdown(text);
	if (tokens.length === 1 && tokens[0]?.type === "text") {
		return tokens[0].text;
	}

	const tokenKeys = new Map<string, number>();
	return tokens.map((token) => {
		const tokenKey = repeatedContentKey(
			`${keyPrefix}-${token.type}`,
			`${token.text}\u001f${token.type === "link" ? token.href : ""}`,
			tokenKeys,
		);
		if (token.type === "code") {
			return (
				<code key={tokenKey} style={styles.markdownInlineCode}>
					{token.text}
				</code>
			);
		}
		if (token.type === "link") {
			return (
				<a
					href={token.href}
					key={tokenKey}
					rel="noreferrer"
					style={styles.markdownLink}
					target="_blank"
				>
					{token.text}
				</a>
			);
		}
		return <span key={tokenKey}>{token.text}</span>;
	});
}

function repeatedContentKey(
	prefix: string,
	content: string,
	counts: Map<string, number>,
): string {
	const baseKey = `${prefix}-${hashString(content)}`;
	const count = counts.get(baseKey) ?? 0;
	counts.set(baseKey, count + 1);
	return count === 0 ? baseKey : `${baseKey}-${count}`;
}

type SkillRolloutsPanelProps = {
	onOpenRepo: (repoId: string) => void;
	rows: readonly SkillRolloutRow[];
};

function SkillRolloutsPanel(props: SkillRolloutsPanelProps): ReactElement {
	return (
		<section aria-label="Skill rollouts" style={styles.rolloutsPage}>
			{props.rows.length > 0 ? (
				<Table aria-label="Skill rollouts">
					<TableHeader>
						<TableRow>
							<TableHead>
								<span style={styles.repoInventoryHeadLabel}>
									<span>Repo</span>
									<span style={styles.repoInventoryHeadCount}>
										{props.rows.length}
									</span>
								</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{props.rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell>
									<div style={styles.repoInventoryNameCell}>
										<span
											style={repoEmojiStyle(row.background)}
											aria-hidden="true"
										>
											{row.emoji}
										</span>
										<SkillRolloutRepoName
											onOpenRepo={props.onOpenRepo}
											row={row}
										/>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<div style={styles.rolloutEmptyState}>
					No repositories found for this skill.
				</div>
			)}
		</section>
	);
}

type SkillRolloutRepoNameProps = {
	onOpenRepo: (repoId: string) => void;
	row: SkillRolloutRow;
};

function SkillRolloutRepoName(props: SkillRolloutRepoNameProps): ReactElement {
	const repoId = props.row.repoId;
	if (!repoId) {
		return <span style={styles.rolloutRepoName}>{props.row.repoName}</span>;
	}

	return (
		<Button
			aria-label={`Open ${props.row.repoName}`}
			onClick={() => props.onOpenRepo(repoId)}
			size="xs"
			style={styles.rolloutRepoName}
			variant="link"
		>
			{props.row.repoName}
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
	const alwaysLoadedMarkdownFiles = buildRepoAlwaysLoadedMarkdownFiles(
		props.repo,
		props.skillArtifacts,
	);
	const inventoryRows = buildRepoSkillInventoryRows(
		props.repo,
		props.skillArtifacts,
		props.skillRows,
	);
	const repoVisual = repoVisualForRow(props.repo);

	return (
		<div style={styles.repoDetailPage}>
			<section aria-labelledby="repo-detail-title" style={styles.repoHero}>
				<div style={styles.repoHeroTop}>
					<div style={styles.repoHeroIdentity}>
						<div style={styles.repoTitleRow}>
							<span
								aria-hidden="true"
								style={repoEmojiStyle(repoVisual.background)}
							>
								{repoVisual.emoji}
							</span>
							<h1 id="repo-detail-title" style={styles.repoDetailTitle}>
								{props.repo.displayName}
							</h1>
						</div>
						<RepoContextFileTags files={alwaysLoadedMarkdownFiles} />
					</div>
				</div>
			</section>

			<section aria-label="Skills in this repo" style={styles.repoSection}>
				{inventoryRows.length > 0 ? (
					<Table aria-label="Skills in this repo">
						<TableHeader>
							<TableRow>
								<TableHead>
									<span style={styles.repoInventoryHeadLabel}>
										<span>Skill</span>
										<span style={styles.repoInventoryHeadCount}>
											{inventoryRows.length}
										</span>
									</span>
								</TableHead>
								<TableHead width={132}>Syncing</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{inventoryRows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<div style={styles.repoInventoryNameCell}>
											<span
												style={skillEmojiStyle(row.background)}
												aria-hidden="true"
											>
												{row.emoji}
											</span>
											<RepoInventorySkillName
												onOpenSkill={props.onOpenSkill}
												row={row}
											/>
										</div>
									</TableCell>
									<TableCell>
										<Tooltip>
											<TooltipTrigger
												aria-label={`${row.syncingLabel}: ${row.syncingDescription} ${row.syncingEvidence}`}
												style={styles.repoSyncingTooltipTrigger}
											>
												<Badge
													style={repoSyncingBadgeStyle(row.syncingLabel)}
													variant="secondary"
												>
													{row.syncingLabel}
												</Badge>
											</TooltipTrigger>
											<TooltipContent
												align="start"
												style={styles.repoSyncingTooltipContent}
											>
												<div style={styles.repoSyncingTooltipTitle}>
													{row.syncingLabel}
												</div>
												<div style={styles.repoSyncingTooltipText}>
													{row.syncingDescription}
												</div>
												<div style={styles.repoSyncingTooltipEvidence}>
													{row.syncingEvidence}
												</div>
											</TooltipContent>
										</Tooltip>
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
		</div>
	);
}

type RepoContextFileTagsProps = {
	files: readonly RepoAlwaysLoadedMarkdownFile[];
};

function RepoContextFileTags(
	props: RepoContextFileTagsProps,
): ReactElement | null {
	if (props.files.length === 0) {
		return null;
	}

	return (
		<div style={styles.repoContextFileTags}>
			{props.files.map((file) => (
				<Badge
					key={file.id}
					style={styles.repoContextFileTag}
					variant="secondary"
				>
					<span style={styles.repoContextFileTagName}>
						{contextFileDisplayName(file)}
					</span>
					<span style={styles.repoContextFileTagLength}>
						{contextFileSizeLabel(file)}
					</span>
				</Badge>
			))}
		</div>
	);
}

function contextFileDisplayName(file: RepoAlwaysLoadedMarkdownFile): string {
	return file.path === file.targetLabel ? file.targetLabel : file.path;
}

function contextFileSizeLabel(file: RepoAlwaysLoadedMarkdownFile): string {
	if (file.fileCount <= 1) {
		return formatCharacterCount(file.characterCount);
	}

	return `${formatCount(file.fileCount, "file")} · ${formatCharacterCount(
		file.characterCount,
	)}`;
}

type RepoInventorySkillNameProps = {
	onOpenSkill: (skillId: string) => void;
	row: RepoSkillInventoryRow;
};

function RepoInventorySkillName(
	props: RepoInventorySkillNameProps,
): ReactElement {
	const skillId = props.row.skillId;
	if (!skillId) {
		return <span style={styles.repoInventoryName}>{props.row.name}</span>;
	}

	return (
		<Button
			aria-label={`Open ${props.row.name}`}
			onClick={() => props.onOpenSkill(skillId)}
			size="xs"
			style={styles.repoInventoryName}
			variant="link"
		>
			{props.row.name}
		</Button>
	);
}

type RepositorySelectionProps = {
	onOpenRepo: (repoId: string) => void;
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
												<RepoTitleButton
													onOpenRepo={props.onOpenRepo}
													row={row}
												/>
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
			style={styles.repoTitleText}
			title={props.row.linkLabel}
			variant="link"
		>
			{props.row.displayName}
		</Button>
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

function skillDefinitionToggleButtonStyle(isActive: boolean): CSSProperties {
	return {
		...styles.skillDefinitionToggleButton,
		...(isActive ? styles.skillDefinitionToggleButtonActive : {}),
	};
}

function repoEmojiStyle(background: string): CSSProperties {
	return {
		...styles.repoEmoji,
		background,
	};
}

function repoSyncingBadgeStyle(label: string): CSSProperties | undefined {
	if (isSymlinkSyncingLabel(label)) {
		return styles.repoSyncingSymlinkBadge;
	}
	switch (label) {
		case "Codex only":
			return styles.repoSyncingCodexBadge;
		case "Claude only":
			return styles.repoSyncingClaudeBadge;
		default:
			return undefined;
	}
}

function isSymlinkSyncingLabel(label: string): boolean {
	return label === "Symlinked" || label.endsWith(" symlink");
}

function markdownHeadingStyle(depth: 1 | 2 | 3 | 4): CSSProperties {
	switch (depth) {
		case 1:
			return styles.markdownH1;
		case 2:
			return styles.markdownH2;
		case 3:
			return styles.markdownH3;
		case 4:
			return styles.markdownH4;
	}
}

function repoSyncingDescription(
	targetLabels: readonly string[],
	label: string,
): string {
	switch (label) {
		case "File symlink":
			return "The SKILL.md file at the detected target is the symbolic link. The repo path points at a shared markdown file, so edits through this path update the linked file.";
		case "Skill folder symlink":
			return "The skill folder is the symbolic link. The repo points the whole skill directory at shared content, including SKILL.md and any skill-local assets.";
		case "Agent root symlink":
			return "The agent root folder is the symbolic link. The repo points the whole .agents or .claude tree somewhere else, so every skill under that root may be shared.";
		case "Parent folder symlink":
			return "A parent directory above the skill is the symbolic link. This skill is shared indirectly through that parent, even if the skill folder itself looks normal.";
		case "Mixed symlink":
			return "Rudel grouped multiple copies of this skill, and those copies use different symlink shapes. Check each target path before editing.";
		case "Symlinked":
			return "Rudel found a symbolic link somewhere in this skill path, but the scanner did not classify which path segment is linked.";
		case "Codex only":
			return "Rudel found this skill only in a Codex target for this repo. The current scan did not find matching Claude, Cursor, or repo-instruction copies.";
		case "Claude only":
			return "Rudel found this skill only in a Claude Code target for this repo. The current scan did not find matching Codex, Cursor, or repo-instruction copies.";
		case "AGENTS.md":
			return "Rudel found repo-level AGENTS.md instructions for this row, not a folder-based skill directory.";
		case "CLAUDE.md":
			return "Rudel found repo-level CLAUDE.md instructions for this row, not a folder-based skill directory.";
		case "Other":
			return "Rudel found local skill content but could not map it to one of the known agent targets.";
		default:
			return `Rudel found this skill in ${repoTargetSummary(targetLabels)}. These copies are grouped as the same skill for repo inventory and rollout planning.`;
	}
}

function repoSyncingEvidence(
	artifacts: readonly SkillArtifact[],
	targetLabels: readonly string[],
): string {
	const copyLabel =
		artifacts.length === 1 ? "1 copy" : `${artifacts.length} copies`;
	return `Scanner evidence: ${copyLabel} in ${repoTargetSummary(targetLabels)}. Example path: ${repoArtifactPathSummary(artifacts)}.`;
}

function repoTargetSummary(targetLabels: readonly string[]): string {
	const visibleLabels = targetLabels.filter((label) => label !== "Unknown");
	if (visibleLabels.length === 0) {
		return "an unknown target";
	}
	if (visibleLabels.length === 1) {
		return `${visibleLabels[0]} target`;
	}
	const leadLabels = visibleLabels.slice(0, -1).join(", ");
	return `${leadLabels} and ${visibleLabels[visibleLabels.length - 1]} targets`;
}

function repoArtifactPathSummary(artifacts: readonly SkillArtifact[]): string {
	const artifact = artifacts[0];
	if (artifact === undefined) {
		return "no path reported";
	}
	const path = artifact.repoRelativePath ?? artifact.path;
	if (artifacts.length === 1) {
		return path;
	}
	return `${path} (+${artifacts.length - 1} more)`;
}

function skillStackIconStyle(
	skill: RepoSkillIconItem,
	index: number,
	activeIndex: number,
	isClickable: boolean,
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
		cursor: isClickable ? "pointer" : "default",
		marginLeft: index === 0 ? 0 : -10,
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

function includeActiveRepoRow(
	rows: readonly RepoOverviewRow[],
	allRows: readonly RepoOverviewRow[],
	activeRepoId: string | undefined,
): readonly RepoOverviewRow[] {
	if (!activeRepoId || rows.some((row) => row.id === activeRepoId)) {
		return rows;
	}

	const activeRepo = repoRowForId(allRows, activeRepoId);
	return activeRepo ? [...rows, activeRepo] : rows;
}

function primaryRepoRowForSkillSource(
	skill: DetectedSkillRow,
	repoRows: readonly RepoOverviewRow[],
): RepoOverviewRow | undefined {
	const repoRootPath = skill.sources
		.find((source) => source.key.startsWith("repo:"))
		?.key.slice("repo:".length);
	if (!repoRootPath) {
		return undefined;
	}

	return repoRows.find((row) => row.repoRootPaths.includes(repoRootPath));
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

function formatCharacterCount(count: number): string {
	return `${count.toLocaleString("en-US")} chars`;
}

export function parseSkillDocument(content: string): ParsedSkillDocument {
	const frontmatterMatch = content.match(
		/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/,
	);
	if (!frontmatterMatch) {
		return {
			frontmatter: emptySkillFrontmatter(),
			body: content,
		};
	}

	return {
		frontmatter: parseSkillFrontmatter(frontmatterMatch[1] ?? ""),
		body: (frontmatterMatch[2] ?? "").trimStart(),
	};
}

function emptySkillFrontmatter(): SkillFrontmatter {
	return {
		name: undefined,
		description: undefined,
		allowedTools: [],
	};
}

function parseSkillFrontmatter(frontmatter: string): SkillFrontmatter {
	const values = new Map<string, string>();
	const lines = frontmatter.split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const separatorIndex = line.indexOf(":");
		if (separatorIndex <= 0) {
			continue;
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key.length === 0 || value.length === 0) {
			continue;
		}
		if (value === "|" || value === ">") {
			const parsedBlock = parseFrontmatterBlockScalar(lines, index + 1);
			if (parsedBlock.value) {
				values.set(key, parsedBlock.value);
			}
			index = parsedBlock.nextIndex - 1;
			continue;
		}
		values.set(key, value);
	}

	return {
		name: parseFrontmatterScalar(values.get("name")),
		description: parseFrontmatterScalar(values.get("description")),
		allowedTools: parseFrontmatterList(values.get("allowed-tools")),
	};
}

function parseFrontmatterBlockScalar(
	lines: readonly string[],
	startIndex: number,
): { nextIndex: number; value: string | undefined } {
	const blockLines: string[] = [];
	let nextIndex = startIndex;
	for (; nextIndex < lines.length; nextIndex += 1) {
		const line = lines[nextIndex] ?? "";
		if (line.trim().length > 0 && !/^\s/.test(line)) {
			break;
		}
		const trimmedLine = line.trim();
		if (trimmedLine.length > 0) {
			blockLines.push(trimmedLine);
		}
	}

	const value = blockLines.join(" ").trim();
	return {
		nextIndex,
		value: value.length > 0 ? value : undefined,
	};
}

function parseFrontmatterScalar(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const unquoted = value.replace(/^['"]|['"]$/g, "").trim();
	return unquoted.length > 0 ? unquoted : undefined;
}

function parseFrontmatterList(value: string | undefined): readonly string[] {
	if (!value) {
		return [];
	}
	const bracketMatch = value.match(/^\[(.*)\]$/);
	const listValue = bracketMatch?.[1] ?? value;
	return listValue
		.split(",")
		.map((item) => parseFrontmatterScalar(item))
		.filter((item): item is string => Boolean(item));
}

export function parseMarkdownBlocks(content: string): readonly MarkdownBlock[] {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const blocks: MarkdownBlock[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (line.trim().length === 0) {
			index += 1;
			continue;
		}

		const codeFence = parseMarkdownCodeFence(lines, index);
		if (codeFence) {
			blocks.push(codeFence.block);
			index = codeFence.nextIndex;
			continue;
		}

		const heading = parseMarkdownHeading(line);
		if (heading) {
			blocks.push(heading);
			index += 1;
			continue;
		}

		if (isMarkdownRule(line)) {
			blocks.push({ type: "rule" });
			index += 1;
			continue;
		}

		const table = parseMarkdownTable(lines, index);
		if (table) {
			blocks.push(table.block);
			index = table.nextIndex;
			continue;
		}

		const list = parseMarkdownList(lines, index);
		if (list) {
			blocks.push(list.block);
			index = list.nextIndex;
			continue;
		}

		const blockquote = parseMarkdownBlockquote(lines, index);
		if (blockquote) {
			blocks.push(blockquote.block);
			index = blockquote.nextIndex;
			continue;
		}

		const paragraph = parseMarkdownParagraph(lines, index);
		blocks.push(paragraph.block);
		index = paragraph.nextIndex;
	}

	return blocks;
}

type MarkdownParseResult<TBlock extends MarkdownBlock> = {
	block: TBlock;
	nextIndex: number;
};

type InlineMarkdownToken =
	| { text: string; type: "code" }
	| { href: string; text: string; type: "link" }
	| { text: string; type: "text" };

function parseMarkdownCodeFence(
	lines: readonly string[],
	startIndex: number,
): MarkdownParseResult<Extract<MarkdownBlock, { type: "code" }>> | undefined {
	const startLine = lines[startIndex] ?? "";
	const fenceMatch = startLine.match(/^\s*(`{3,}|~{3,})\s*([\w-]+)?\s*$/);
	if (!fenceMatch) {
		return undefined;
	}

	const fence = fenceMatch[1] ?? "```";
	const fenceCharacter = fence[0] ?? "`";
	const language = fenceMatch[2];
	const codeLines: string[] = [];
	let nextIndex = startIndex + 1;
	for (; nextIndex < lines.length; nextIndex += 1) {
		const line = lines[nextIndex] ?? "";
		if (line.trim().startsWith(fenceCharacter.repeat(fence.length))) {
			nextIndex += 1;
			break;
		}
		codeLines.push(line);
	}

	return {
		block: { code: codeLines.join("\n"), language, type: "code" },
		nextIndex,
	};
}

function parseMarkdownHeading(
	line: string,
): Extract<MarkdownBlock, { type: "heading" }> | undefined {
	const match = line.match(/^(#{1,4})\s+(.+)$/);
	if (!match) {
		return undefined;
	}

	return {
		depth: match[1]?.length as 1 | 2 | 3 | 4,
		text: (match[2] ?? "").replace(/\s+#+\s*$/, "").trim(),
		type: "heading",
	};
}

function isMarkdownRule(line: string): boolean {
	return /^([-*_])(?:\s*\1){2,}$/.test(line.trim());
}

function parseMarkdownTable(
	lines: readonly string[],
	startIndex: number,
): MarkdownParseResult<Extract<MarkdownBlock, { type: "table" }>> | undefined {
	const headerLine = lines[startIndex] ?? "";
	const separatorLine = lines[startIndex + 1] ?? "";
	if (!headerLine.includes("|") || !isMarkdownTableSeparator(separatorLine)) {
		return undefined;
	}

	const headers = splitMarkdownTableRow(headerLine);
	const rows: string[][] = [];
	let nextIndex = startIndex + 2;
	for (; nextIndex < lines.length; nextIndex += 1) {
		const line = lines[nextIndex] ?? "";
		if (line.trim().length === 0 || !line.includes("|")) {
			break;
		}
		rows.push(splitMarkdownTableRow(line));
	}

	return {
		block: { headers, rows, type: "table" },
		nextIndex,
	};
}

function isMarkdownTableSeparator(line: string): boolean {
	const cells = splitMarkdownTableRow(line);
	return (
		cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
	);
}

function splitMarkdownTableRow(line: string): string[] {
	const trimmedLine = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	return trimmedLine.split("|").map((cell) => cell.trim());
}

function parseMarkdownList(
	lines: readonly string[],
	startIndex: number,
): MarkdownParseResult<Extract<MarkdownBlock, { type: "list" }>> | undefined {
	const firstItem = parseMarkdownListItem(lines[startIndex] ?? "");
	if (!firstItem) {
		return undefined;
	}

	const items: string[] = [];
	let nextIndex = startIndex;
	for (; nextIndex < lines.length; nextIndex += 1) {
		const item = parseMarkdownListItem(lines[nextIndex] ?? "");
		if (!item || item.ordered !== firstItem.ordered) {
			break;
		}
		items.push(item.text);
	}

	return {
		block: { items, ordered: firstItem.ordered, type: "list" },
		nextIndex,
	};
}

function parseMarkdownListItem(
	line: string,
): { ordered: boolean; text: string } | undefined {
	const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
	if (orderedMatch) {
		return { ordered: true, text: (orderedMatch[1] ?? "").trim() };
	}

	const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
	if (unorderedMatch) {
		return { ordered: false, text: (unorderedMatch[1] ?? "").trim() };
	}

	return undefined;
}

function parseMarkdownBlockquote(
	lines: readonly string[],
	startIndex: number,
):
	| MarkdownParseResult<Extract<MarkdownBlock, { type: "blockquote" }>>
	| undefined {
	const firstLine = lines[startIndex] ?? "";
	if (!/^\s*>\s?/.test(firstLine)) {
		return undefined;
	}

	const quoteLines: string[] = [];
	let nextIndex = startIndex;
	for (; nextIndex < lines.length; nextIndex += 1) {
		const line = lines[nextIndex] ?? "";
		if (!/^\s*>\s?/.test(line)) {
			break;
		}
		quoteLines.push(line.replace(/^\s*>\s?/, "").trim());
	}

	return {
		block: { text: quoteLines.join(" "), type: "blockquote" },
		nextIndex,
	};
}

function parseMarkdownParagraph(
	lines: readonly string[],
	startIndex: number,
): MarkdownParseResult<Extract<MarkdownBlock, { type: "paragraph" }>> {
	const paragraphLines: string[] = [];
	let nextIndex = startIndex;
	for (; nextIndex < lines.length; nextIndex += 1) {
		const line = lines[nextIndex] ?? "";
		if (line.trim().length === 0) {
			break;
		}
		if (paragraphLines.length > 0 && isMarkdownBlockStart(lines, nextIndex)) {
			break;
		}
		paragraphLines.push(line.trim());
	}

	return {
		block: { text: paragraphLines.join(" "), type: "paragraph" },
		nextIndex,
	};
}

function isMarkdownBlockStart(
	lines: readonly string[],
	index: number,
): boolean {
	const line = lines[index] ?? "";
	return (
		parseMarkdownHeading(line) !== undefined ||
		parseMarkdownCodeFence(lines, index) !== undefined ||
		parseMarkdownTable(lines, index) !== undefined ||
		parseMarkdownListItem(line) !== undefined ||
		/^\s*>\s?/.test(line) ||
		isMarkdownRule(line)
	);
}

function tokenizeInlineMarkdown(text: string): readonly InlineMarkdownToken[] {
	const tokens: InlineMarkdownToken[] = [];
	const tokenPattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
	let cursor = 0;
	let match = tokenPattern.exec(text);

	while (match !== null) {
		const tokenText = match[0] ?? "";
		if (match.index > cursor) {
			tokens.push({ text: text.slice(cursor, match.index), type: "text" });
		}
		if (tokenText.startsWith("`")) {
			tokens.push({ text: tokenText.slice(1, -1), type: "code" });
		} else {
			const linkMatch = tokenText.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
			tokens.push({
				href: linkMatch?.[2] ?? "#",
				text: linkMatch?.[1] ?? tokenText,
				type: "link",
			});
		}
		cursor = match.index + tokenText.length;
		match = tokenPattern.exec(text);
	}

	if (cursor < text.length) {
		tokens.push({ text: text.slice(cursor), type: "text" });
	}

	return tokens.length > 0 ? tokens : [{ text, type: "text" }];
}

export function buildRepoSkillIconItems(
	row: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
	skillRows?: readonly DetectedSkillRow[],
): readonly RepoSkillIconItem[] {
	const repoRootPaths = new Set(row.repoRootPaths);
	const repoArtifacts = artifacts.filter(
		(artifact) =>
			artifact.repoRootPath !== undefined &&
			repoRootPaths.has(artifact.repoRootPath),
	);
	const itemsByName = new Map<string, RepoSkillIconItem>();
	for (const artifact of repoArtifacts) {
		const item = skillIconItemForArtifact(artifact, repoArtifacts, skillRows);
		const itemKey = item.name.trim().toLocaleLowerCase();
		const existingItem = itemsByName.get(itemKey);
		if (!existingItem || (!existingItem.skillId && item.skillId)) {
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
		rows.push(skillRolloutRowForRepo(repoRow));
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

	for (const repoRootPath of orphanGroups.keys()) {
		rows.push(skillRolloutRowForOrphanRepo(repoRootPath));
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

export function buildRepoAlwaysLoadedMarkdownFiles(
	row: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
): readonly RepoAlwaysLoadedMarkdownFile[] {
	const filesByPath = new Map<string, RepoAlwaysLoadedMarkdownFile>();
	for (const artifact of repoArtifactsForRow(row, artifacts)) {
		if (!isAlwaysLoadedMarkdownArtifact(artifact)) {
			continue;
		}

		const path = artifact.repoRelativePath ?? artifact.path;
		const existingFile = filesByPath.get(path);
		const characterCount = artifact.content.length;
		if (existingFile && existingFile.characterCount >= characterCount) {
			continue;
		}

		filesByPath.set(path, {
			id: path,
			path,
			targetLabel: alwaysLoadedMarkdownTargetLabel(artifact),
			characterCount,
			fileCount: 1,
		});
	}

	const rootFiles: RepoAlwaysLoadedMarkdownFile[] = [];
	const nestedGroups = new Map<string, RepoAlwaysLoadedMarkdownFile>();

	for (const file of filesByPath.values()) {
		if (isRootContextFilePath(file.path)) {
			rootFiles.push(file);
			continue;
		}

		const id = `nested:${file.targetLabel}`;
		const existingGroup = nestedGroups.get(id);
		nestedGroups.set(id, {
			id,
			path: `Nested ${file.targetLabel}`,
			targetLabel: file.targetLabel,
			characterCount:
				(existingGroup?.characterCount ?? 0) + file.characterCount,
			fileCount: (existingGroup?.fileCount ?? 0) + 1,
		});
	}

	return [...rootFiles, ...nestedGroups.values()].sort(sortRepoContextFileTags);
}

function sortRepoContextFileTags(
	left: RepoAlwaysLoadedMarkdownFile,
	right: RepoAlwaysLoadedMarkdownFile,
): number {
	return (
		contextFilePriority(left) - contextFilePriority(right) ||
		right.characterCount - left.characterCount ||
		left.path.localeCompare(right.path)
	);
}

function contextFilePriority(file: RepoAlwaysLoadedMarkdownFile): number {
	const isRoot = file.fileCount <= 1 && isRootContextFilePath(file.path);
	if (isRoot && file.targetLabel === "AGENTS.md") {
		return 0;
	}
	if (isRoot && file.targetLabel === "CLAUDE.md") {
		return 1;
	}
	if (!isRoot && file.targetLabel === "AGENTS.md") {
		return 2;
	}
	if (!isRoot && file.targetLabel === "CLAUDE.md") {
		return 3;
	}
	return 4;
}

function isRootContextFilePath(path: string): boolean {
	return path.split(/[\\/]/).filter((part) => part.length > 0).length <= 1;
}

function isAlwaysLoadedMarkdownArtifact(artifact: SkillArtifact): boolean {
	const fileName = pathBaseName(artifact.repoRelativePath ?? artifact.path);
	return (
		artifact.artifactTarget === "agents_md" ||
		artifact.artifactTarget === "claude_md" ||
		fileName === "AGENTS.md" ||
		fileName === "CLAUDE.md"
	);
}

function alwaysLoadedMarkdownTargetLabel(artifact: SkillArtifact): string {
	const fileName = pathBaseName(artifact.repoRelativePath ?? artifact.path);
	if (fileName === "AGENTS.md" || fileName === "CLAUDE.md") {
		return fileName;
	}
	return artifactTargetLabel(artifact.artifactTarget);
}

function repoSkillInventoryRowForGroup(
	group: RepoSkillInventoryGroup,
	skillRows: readonly DetectedSkillRow[],
): RepoSkillInventoryRow {
	const status = repoSkillStatusForArtifacts(group.artifacts);
	const source = repoSkillSourceForArtifacts(group.artifacts);
	const matchingSkill = skillRowForId(skillRows, group.id);
	const overlayHash = overlayHashForArtifacts(group.artifacts);
	const targetLabels = repoMaterializationTargetLabels(group.artifacts);
	const syncingLabel = repoSyncingLabel(group.artifacts, targetLabels);
	const visual = skillVisualForName(group.name);
	return {
		id: group.id,
		name: group.name,
		emoji: visual.emoji,
		background: visual.background,
		status,
		statusLabel: statusLabelForRepoSkill(status),
		source,
		sourceLabel: sourceLabelForRepoSkill(source, group.artifacts),
		syncingLabel,
		syncingDescription: repoSyncingDescription(targetLabels, syncingLabel),
		syncingEvidence: repoSyncingEvidence(group.artifacts, targetLabels),
		targetLabels,
		skillId: matchingSkill?.id,
		overlayHash,
		hasOverlay: overlayHash !== undefined,
		copyCount: group.artifacts.length,
	};
}

function skillRolloutRowForRepo(repoRow: RepoOverviewRow): SkillRolloutRow {
	const visual = repoVisualForRow(repoRow);
	return {
		id: repoRow.id,
		repoId: repoRow.id,
		repoName: repoRow.displayName,
		emoji: visual.emoji,
		background: visual.background,
	};
}

function skillRolloutRowForOrphanRepo(repoRootPath: string): SkillRolloutRow {
	const repoName = pathBaseName(repoRootPath) ?? repoRootPath;
	const visual = repoVisualForLabel(repoRootPath);
	return {
		id: `local:${repoRootPath}`,
		repoName,
		emoji: visual.emoji,
		background: visual.background,
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

function repoSyncingLabel(
	artifacts: readonly SkillArtifact[],
	targetLabels: readonly string[],
): string {
	if (artifacts.some((artifact) => artifact.sourceScope === "symlink")) {
		return repoSymlinkSyncingLabel(artifacts);
	}

	const visibleLabels = targetLabels.filter((label) => label !== "Unknown");
	if (visibleLabels.length === 0) {
		return "Other";
	}
	if (visibleLabels.length === 1) {
		const label = visibleLabels[0] ?? "Other";
		if (label === "Codex" || label === "Claude") {
			return `${label} only`;
		}
		return label;
	}
	return visibleLabels.join(" · ");
}

function repoSymlinkSyncingLabel(artifacts: readonly SkillArtifact[]): string {
	const symlinkKinds = new Set(
		artifacts
			.filter((artifact) => artifact.sourceScope === "symlink")
			.map((artifact) => artifact.symlinkKind)
			.filter((kind): kind is NonNullable<SkillArtifact["symlinkKind"]> =>
				Boolean(kind),
			),
	);
	if (symlinkKinds.size > 1) {
		return "Mixed symlink";
	}

	const [kind] = symlinkKinds;
	switch (kind) {
		case "file":
			return "File symlink";
		case "skill_folder":
			return "Skill folder symlink";
		case "agent_root":
			return "Agent root symlink";
		case "ancestor_folder":
			return "Parent folder symlink";
		case undefined:
			return "Symlinked";
	}
	return "Symlinked";
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

function skillIconItemForArtifact(
	artifact: SkillArtifact,
	artifacts: readonly SkillArtifact[],
	skillRows: readonly DetectedSkillRow[] | undefined,
): RepoSkillIconItem {
	const parentArtifact = containingParentSkillArtifact(artifact, artifacts);
	const name = parentArtifact
		? skillNameForArtifact(parentArtifact)
		: motherSkillDisplayNameForArtifact(artifact);
	const visual = skillVisualForName(name);
	const skillId = skillRows?.find(
		(row) => row.id === name.trim().toLocaleLowerCase(),
	)?.id;
	return {
		id: skillArtifactKey(artifact),
		name,
		emoji: visual.emoji,
		background: visual.background,
		...(skillId ? { skillId } : {}),
	};
}

function containingParentSkillArtifact(
	artifact: SkillArtifact,
	artifacts: readonly SkillArtifact[],
): SkillArtifact | undefined {
	const artifactPath = canonicalArtifactPath(artifact);
	const artifactDirectory = pathDirName(artifactPath);
	if (!artifactDirectory) {
		return undefined;
	}

	const parentCandidates = artifacts
		.filter((candidate) => candidate !== artifact)
		.flatMap((candidate) => {
			const directory = pathDirName(canonicalArtifactPath(candidate));
			return directory ? [{ artifact: candidate, directory }] : [];
		})
		.filter(
			(candidate) =>
				candidate.directory !== artifactDirectory &&
				pathBaseName(canonicalArtifactPath(candidate.artifact)) ===
					"SKILL.md" &&
				isPathDescendantOf(artifactPath, candidate.directory),
		)
		.sort(
			(left, right) =>
				left.directory.length - right.directory.length ||
				left.directory.localeCompare(right.directory),
		);

	return parentCandidates[0]?.artifact;
}

function canonicalArtifactPath(artifact: SkillArtifact): string {
	return normalizePathSeparators(artifact.path);
}

function normalizePathSeparators(path: string): string {
	return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

function pathDirName(path: string): string | undefined {
	const normalizedPath = normalizePathSeparators(path);
	const separatorIndex = normalizedPath.lastIndexOf("/");
	if (separatorIndex <= 0) {
		return undefined;
	}
	return normalizedPath.slice(0, separatorIndex);
}

function isPathDescendantOf(path: string, directory: string): boolean {
	const normalizedPath = normalizePathSeparators(path);
	const normalizedDirectory = normalizePathSeparators(directory);
	return normalizedPath.startsWith(`${normalizedDirectory}/`);
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
	const nestedParentSkillFolderName =
		parentSkillFolderNameForNestedSkillPath(relativePath);
	if (nestedParentSkillFolderName) {
		return nestedParentSkillFolderName;
	}

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

function parentSkillFolderNameForNestedSkillPath(
	path: string,
): string | undefined {
	const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
	const skillFileIndex = parts.lastIndexOf("SKILL.md");
	if (skillFileIndex < 0) {
		return undefined;
	}

	for (let index = 1; index < skillFileIndex - 1; index += 1) {
		const segment = parts[index];
		if (!isAgentSkillRootSegment(segment) || parts[index + 1] !== "skills") {
			continue;
		}

		const parentFolderName = parts[index - 1];
		const hasOuterSkillRoot = parts
			.slice(0, index)
			.some((part) => part === "skills");
		const isShortenedParentRelativePath = index === 1;
		if (
			parentFolderName &&
			(hasOuterSkillRoot || isShortenedParentRelativePath)
		) {
			return parentFolderName;
		}
	}

	return undefined;
}

function isAgentSkillRootSegment(segment: string | undefined): boolean {
	return (
		segment === ".agents" || segment === ".claude" || segment === ".cursor"
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
	return repoVisualForLabel(row.linkLabel);
}

function repoVisualForLabel(label: string): {
	background: string;
	emoji: string;
} {
	const normalizedLabel = label.toLocaleLowerCase();
	if (normalizedLabel.includes("api") || normalizedLabel.includes("test")) {
		return { emoji: "🧪", background: "#f5e8ff" };
	}
	if (normalizedLabel.includes("auth") || normalizedLabel.includes("secret")) {
		return { emoji: "🔐", background: "#e8f8ef" };
	}
	if (normalizedLabel.includes("doc") || normalizedLabel.includes("wiki")) {
		return { emoji: "📚", background: "#f1f1f1" };
	}
	if (normalizedLabel.includes("infra") || normalizedLabel.includes("ops")) {
		return { emoji: "⚙️", background: "#f3ecdf" };
	}
	if (normalizedLabel.includes("mobile")) {
		return { emoji: "📱", background: "#e8f8ef" };
	}
	if (normalizedLabel.includes("ui") || normalizedLabel.includes("design")) {
		return { emoji: "🎨", background: "#fff2d8" };
	}

	const visuals = [
		{ emoji: "💻", background: "#f1f1f1" },
		{ emoji: "🧩", background: "#f1f1f1" },
		{ emoji: "📦", background: "#f3ecdf" },
		{ emoji: "🚀", background: "#ffe8ef" },
	] as const;
	return visuals[hashString(label) % visuals.length] ?? visuals[0];
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
		return { emoji: "🎯", background: "#f1f1f1" };
	}
	if (normalizedName.includes("codex")) {
		return { emoji: "🧬", background: "#f1f1f1" };
	}
	if (normalizedName.includes("test") || normalizedName.includes("qa")) {
		return { emoji: "🧪", background: "#f5e8ff" };
	}
	if (normalizedName.includes("api")) {
		return { emoji: "🔌", background: "#e8f8ef" };
	}
	if (
		normalizedName.includes("query") ||
		normalizedName.includes("clickhouse") ||
		normalizedName.includes("postgres") ||
		normalizedName.includes("sql") ||
		normalizedName.includes("database")
	) {
		return { emoji: "🗄️", background: "#f1f1f1" };
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
		return { emoji: "📚", background: "#f1f1f1" };
	}
	if (
		normalizedName.includes("pr") ||
		normalizedName.includes("github") ||
		normalizedName.includes("git")
	) {
		return { emoji: "🚢", background: "#ffe8ef" };
	}
	if (normalizedName.includes("review")) {
		return { emoji: "🔎", background: "#f1f1f1" };
	}
	if (normalizedName.includes("ui") || normalizedName.includes("design")) {
		return { emoji: "🎨", background: "#fff2d8" };
	}
	if (normalizedName.includes("browser") || normalizedName.includes("browse")) {
		return { emoji: "🌐", background: "#e8f8ef" };
	}
	if (normalizedName.includes("linear") || normalizedName.includes("plan")) {
		return { emoji: "📋", background: "#f1f1f1" };
	}
	if (normalizedName.includes("image") || normalizedName.includes("video")) {
		return { emoji: "🖼️", background: "#ffe8ef" };
	}
	if (normalizedName.includes("presentation")) {
		return { emoji: "📊", background: "#f1f1f1" };
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
		return { emoji: "🖥️", background: "#f1f1f1" };
	}
	if (normalizedName.includes("typescript")) {
		return { emoji: "TS", background: "#f1f1f1" };
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
		{ emoji: "🧭", background: "#f1f1f1" },
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
		overflowX: "hidden",
		overflowY: "auto",
		padding: "0 20px 20px",
	} satisfies CSSProperties,
	dashboardTable: {
		tableLayout: "fixed",
	} satisfies CSSProperties,
	dashboardRepoTable: {
		tableLayout: "fixed",
	} satisfies CSSProperties,
	dashboardTableRight: {
		width: 140,
		color: "#737373",
		textAlign: "right",
	} satisfies CSSProperties,
	dashboardRepoCell: {
		minWidth: 0,
		overflow: "hidden",
	} satisfies CSSProperties,
	dashboardSkillIconCell: {
		width: "min(46vw, 430px)",
		maxWidth: "min(46vw, 430px)",
		paddingLeft: 18,
		paddingRight: 4,
		textAlign: "right",
		overflow: "visible",
	} satisfies CSSProperties,
	dashboardSkillIconAligner: {
		boxSizing: "border-box",
		minWidth: 0,
		maxWidth: "100%",
		display: "flex",
		justifyContent: "flex-end",
		overflow: "visible",
		padding: "3px 0 3px 12px",
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
		overflow: "hidden",
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
		boxSizing: "border-box",
		minWidth: 0,
		maxWidth: "100%",
		minInlineSize: 0,
		flex: "0 1 auto",
		border: 0,
		margin: "0 0 0 auto",
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		overflow: "visible",
		padding: 0,
	} satisfies CSSProperties,
	skillStackMoreBadge: {
		position: "relative",
		minWidth: 34,
		height: 26,
		border: "1px solid #ffffff",
		borderRadius: 999,
		background: "#f1f1f1",
		boxShadow: "0 1px 2px rgba(5, 5, 5, 0.08)",
		color: "#525252",
		display: "grid",
		flex: "0 0 auto",
		fontSize: 11,
		fontWeight: 650,
		fontVariantNumeric: "tabular-nums",
		lineHeight: "26px",
		marginLeft: -10,
		padding: "0 7px",
		placeItems: "center",
		zIndex: 1,
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
		alignItems: "flex-start",
		gap: 12,
	} satisfies CSSProperties,
	skillHeroCopy: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
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
	skillHeroFrontmatter: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 8,
	} satisfies CSSProperties,
	skillHeroDescription: {
		minWidth: 0,
		maxWidth: 920,
		margin: 0,
		color: "#525252",
		fontSize: 14,
		fontWeight: 400,
		lineHeight: 1.45,
	} satisfies CSSProperties,
	skillHeroTools: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 6,
	} satisfies CSSProperties,
	skillHeroToolsLabel: {
		color: "#737373",
		fontSize: 12,
		fontWeight: 500,
		lineHeight: "20px",
	} satisfies CSSProperties,
	skillHeroToolBadge: {
		fontWeight: 500,
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
	skillDefinitionToolbar: {
		display: "flex",
		justifyContent: "flex-start",
	} satisfies CSSProperties,
	skillDefinitionToggle: {
		minHeight: 32,
		border: 0,
		borderRadius: 8,
		background: "#f1f1f1",
		display: "inline-flex",
		alignItems: "center",
		gap: 2,
		margin: 0,
		padding: 3,
	} satisfies CSSProperties,
	skillDefinitionToggleButton: {
		minHeight: 26,
		borderRadius: 6,
		background: "transparent",
		boxShadow: "none",
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		lineHeight: "18px",
		padding: "0 10px",
	} satisfies CSSProperties,
	skillDefinitionToggleButtonActive: {
		background: "#ffffff",
		boxShadow: "0 1px 2px rgba(5, 5, 5, 0.08)",
		color: "#050505",
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
	skillContent: {
		width: "100%",
		minHeight: 340,
		flex: "1 1 auto",
		maxHeight: 760,
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
	markdownDocument: {
		width: "100%",
		minHeight: 340,
		flex: "1 1 auto",
		maxHeight: 760,
		border: "1px solid rgba(5, 5, 5, 0.08)",
		borderRadius: 8,
		background: "#ffffff",
		color: "#171717",
		display: "flex",
		flexDirection: "column",
		gap: 14,
		overflow: "auto",
		padding: "24px 26px 28px",
	} satisfies CSSProperties,
	markdownH1: {
		margin: "0 0 2px",
		color: "#050505",
		fontSize: 28,
		fontWeight: 600,
		letterSpacing: 0,
		lineHeight: 1.16,
	} satisfies CSSProperties,
	markdownH2: {
		margin: "12px 0 0",
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
		color: "#050505",
		fontSize: 22,
		fontWeight: 600,
		letterSpacing: 0,
		lineHeight: 1.22,
		paddingBottom: 8,
	} satisfies CSSProperties,
	markdownH3: {
		margin: "8px 0 0",
		color: "#050505",
		fontSize: 18,
		fontWeight: 600,
		letterSpacing: 0,
		lineHeight: 1.3,
	} satisfies CSSProperties,
	markdownH4: {
		margin: "4px 0 0",
		color: "#171717",
		fontSize: 15,
		fontWeight: 600,
		letterSpacing: 0,
		lineHeight: 1.35,
	} satisfies CSSProperties,
	markdownParagraph: {
		maxWidth: 780,
		margin: 0,
		color: "#404040",
		fontSize: 14,
		fontWeight: 400,
		lineHeight: 1.72,
	} satisfies CSSProperties,
	markdownBlockquote: {
		margin: 0,
		borderLeft: "3px solid rgba(5, 5, 5, 0.18)",
		color: "#404040",
		fontSize: 14,
		fontWeight: 400,
		lineHeight: 1.7,
		padding: "2px 0 2px 14px",
	} satisfies CSSProperties,
	markdownList: {
		margin: 0,
		color: "#404040",
		display: "grid",
		gap: 6,
		fontSize: 14,
		fontWeight: 400,
		lineHeight: 1.62,
		paddingLeft: 22,
	} satisfies CSSProperties,
	markdownListItem: {
		paddingLeft: 2,
	} satisfies CSSProperties,
	markdownCodeBlock: {
		minHeight: 112,
		maxHeight: 420,
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
		padding: 14,
		whiteSpace: "pre",
	} satisfies CSSProperties,
	markdownInlineCode: {
		border: "1px solid rgba(5, 5, 5, 0.08)",
		borderRadius: 6,
		background: "#f5f5f5",
		color: "#171717",
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: "0.92em",
		padding: "1px 5px",
	} satisfies CSSProperties,
	markdownLink: {
		color: "#171717",
		fontWeight: 500,
		textDecoration: "underline",
		textUnderlineOffset: 3,
	} satisfies CSSProperties,
	markdownRule: {
		width: "100%",
		height: 1,
		border: 0,
		background: "rgba(5, 5, 5, 0.08)",
		margin: "4px 0",
	} satisfies CSSProperties,
	rolloutsPage: {
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 14,
		padding: "28px 40px 32px",
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
	repoInventoryHeadLabel: {
		display: "inline-flex",
		alignItems: "baseline",
		gap: 8,
		minWidth: 0,
	} satisfies CSSProperties,
	repoInventoryHeadCount: {
		color: "#737373",
		fontSize: 12,
		fontWeight: 500,
		fontVariantNumeric: "tabular-nums",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoContextFileTags: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 2,
	} satisfies CSSProperties,
	repoContextFileTag: {
		gap: 7,
		maxWidth: "100%",
	} satisfies CSSProperties,
	repoContextFileTagName: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	repoContextFileTagLength: {
		color: "#737373",
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
	repoSyncingTooltipTrigger: {
		maxWidth: "100%",
		border: 0,
		background: "transparent",
		display: "inline-flex",
		alignItems: "center",
		padding: 0,
		color: "inherit",
		font: "inherit",
		cursor: "help",
	} satisfies CSSProperties,
	repoSyncingTooltipContent: {
		maxWidth: 340,
		display: "grid",
		gap: 6,
	} satisfies CSSProperties,
	repoSyncingTooltipTitle: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: 500,
		lineHeight: 1.35,
	} satisfies CSSProperties,
	repoSyncingTooltipText: {
		color: "rgba(255, 255, 255, 0.82)",
		fontSize: 12,
		fontWeight: 400,
		lineHeight: 1.45,
	} satisfies CSSProperties,
	repoSyncingTooltipEvidence: {
		borderTop: "1px solid rgba(255, 255, 255, 0.16)",
		color: "rgba(255, 255, 255, 0.66)",
		fontSize: 12,
		fontWeight: 400,
		lineHeight: 1.45,
		paddingTop: 6,
		overflowWrap: "anywhere",
	} satisfies CSSProperties,
	repoSyncingSymlinkBadge: {
		borderColor: "#b7e4c7",
		background: "#e9f8ee",
		color: "#176c3a",
	} satisfies CSSProperties,
	repoSyncingCodexBadge: {
		borderColor: "rgba(5, 5, 5, 0.1)",
		background: "#f1f1f1",
		color: "#404040",
	} satisfies CSSProperties,
	repoSyncingClaudeBadge: {
		borderColor: "#f4c7a6",
		background: "#fff1e6",
		color: "#8a3f12",
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
	sourceLink: {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		maxWidth: 132,
		marginLeft: "auto",
		minWidth: 0,
		color: "#737373",
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
		minWidth: 0,
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
