import type { MachineScanResult, SkillArtifact } from "@rudel/skill-schema";
import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
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
	| { screen: "skill"; skillId: string };

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

type RepoSkillIconItem = {
	id: string;
	name: string;
	targetLabel: string;
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

	function showMainOverview() {
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
				onOpenSkill={openSkillPage}
				onShowMain={showMainOverview}
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
	onOpenSkill: (skillId: string) => void;
	onShowMain: () => void;
	onShowSkills: () => void;
	page: DashboardPage;
	repoRows: readonly RepoOverviewRow[];
	repoScanState: RepoScanState;
	skillArtifacts: readonly SkillArtifact[];
	skillRows: readonly DetectedSkillRow[];
	skillScanState: SkillScanState;
	windowChrome: DesktopWindowChrome | undefined;
};

function Dashboard(props: DashboardProps): ReactElement {
	const selectedSkill =
		props.page.screen === "skill"
			? skillRowForId(props.skillRows, props.page.skillId)
			: undefined;

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
					{selectedSkill ? (
						<DashboardBreadcrumb
							onShowMain={props.onShowMain}
							onShowSkills={props.onShowSkills}
							skill={selectedSkill}
						/>
					) : (
						<span data-tauri-drag-region>Main</span>
					)}
				</div>
				<div data-tauri-drag-region style={styles.titlebarDragFill} />
			</header>

			<section style={styles.dashboardContent} aria-label="Main dashboard">
				{selectedSkill ? (
					<SkillDetailPage skill={selectedSkill} />
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
			<Table aria-label="Repositories" style={styles.dashboardTable}>
				<TableBody>
					{props.repoRows.map((row) => {
						const visual = repoVisualForRow(row);
						const skillIcons = skillIconItemsForRepoRow(
							row,
							props.skillArtifacts,
						);
						return (
							<TableRow key={row.id}>
								<TableCell>
									<div style={styles.dashboardRepoCell}>
										<div style={styles.dashboardRepoLine}>
											<span
												style={repoEmojiStyle(visual.background)}
												aria-hidden="true"
											>
												{visual.emoji}
											</span>
											<div style={styles.dashboardRepoText}>
												<RepoTitleLink row={row} />
												<span style={styles.repoInlineMeta}>
													{repoSkillCountsLabel(row)}
												</span>
											</div>
										</div>
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
				<Tooltip key={skill.id}>
					<TooltipTrigger
						aria-label={skill.name}
						delay={80}
						onBlur={() => setActiveSkillId(undefined)}
						onFocus={() => setActiveSkillId(skill.id)}
						onMouseEnter={() => setActiveSkillId(skill.id)}
						onMouseLeave={() => setActiveSkillId(undefined)}
						style={skillStackIconStyle(skill, index, activeIndex)}
					>
						{skill.emoji}
					</TooltipTrigger>
					<TooltipContent>
						<div style={styles.skillIconTooltipTitle}>{skill.name}</div>
						<div style={styles.skillIconTooltipMeta}>{skill.targetLabel}</div>
					</TooltipContent>
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
		<button
			aria-label={`Open ${props.skill.name}`}
			onClick={() => props.onOpenSkill(props.skill.id)}
			style={styles.skillNameButton}
			type="button"
		>
			{props.skill.name}
		</button>
	);
}

type DashboardBreadcrumbProps = {
	onShowMain: () => void;
	onShowSkills: () => void;
	skill: DetectedSkillRow;
};

function DashboardBreadcrumb(props: DashboardBreadcrumbProps): ReactElement {
	return (
		<nav aria-label="Breadcrumb" style={styles.breadcrumb}>
			<button
				onClick={props.onShowMain}
				style={styles.breadcrumbButton}
				type="button"
			>
				Main
			</button>
			<span aria-hidden="true" style={styles.breadcrumbSeparator}>
				/
			</span>
			<button
				onClick={props.onShowSkills}
				style={styles.breadcrumbButton}
				type="button"
			>
				Skills
			</button>
			<span aria-hidden="true" style={styles.breadcrumbSeparator}>
				/
			</span>
			<span aria-current="page" style={styles.breadcrumbCurrent}>
				{props.skill.name}
			</span>
		</nav>
	);
}

type SkillDetailPageProps = {
	skill: DetectedSkillRow;
};

function SkillDetailPage(props: SkillDetailPageProps): ReactElement {
	const content =
		props.skill.content.trim().length > 0
			? props.skill.content
			: "No content available for this skill.";

	return (
		<div style={styles.skillDetailPage}>
			<section
				aria-label={`${props.skill.name} content`}
				style={styles.skillDetail}
			>
				<div style={styles.skillDetailHeader}>
					<span
						aria-hidden="true"
						style={skillDetailEmojiStyle(props.skill.background)}
					>
						{props.skill.emoji}
					</span>
					<div style={styles.skillDetailMeta}>
						<div style={styles.skillDetailSource}>
							{props.skill.sourcePrimaryLabel}
						</div>
						<div style={styles.skillDetailSummary}>
							{formatCount(props.skill.copyCount, "copy")} across{" "}
							{props.skill.sourceLabel}
						</div>
					</div>
				</div>

				<pre style={styles.skillContent}>{content}</pre>
			</section>
		</div>
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
												<RepoTitleLink row={row} />
												<span style={styles.repoInlineMeta}>
													{repoSkillCountsLabel(row)}
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

type RepoTitleLinkProps = {
	row: RepoOverviewRow;
};

function RepoTitleLink(props: RepoTitleLinkProps): ReactElement {
	if (props.row.linkHref) {
		return (
			<a
				href={props.row.linkHref}
				rel="noreferrer"
				style={styles.repoTitleLink}
				target="_blank"
				title={props.row.linkLabel}
			>
				{props.row.displayName}
			</a>
		);
	}

	return (
		<span style={styles.repoTitleLink} title={props.row.linkLabel}>
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

function sourceLabelForRow(sources: readonly DetectedSkillSource[]): string {
	const primarySource = sources[0]?.label ?? "Local";
	const additionalSourceCount = sources.length - 1;
	if (additionalSourceCount > 0) {
		return `${primarySource} + ${additionalSourceCount}`;
	}
	return primarySource;
}

function repoSkillCountsLabel(row: RepoOverviewRow): string {
	return `${formatCount(row.skillFileCount, "skill")} · ${row.dirtySkillFileCount} dirty`;
}

function formatCount(count: number, singularLabel: string): string {
	return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}

function skillIconItemsForRepoRow(
	row: RepoOverviewRow,
	artifacts: readonly SkillArtifact[],
): readonly RepoSkillIconItem[] {
	const repoRootPaths = new Set(row.repoRootPaths);
	return artifacts
		.filter((artifact) => {
			if (!artifact.repoRootPath) {
				return false;
			}
			return repoRootPaths.has(artifact.repoRootPath);
		})
		.map(skillIconItemForArtifact)
		.sort(
			(left, right) =>
				left.name.localeCompare(right.name) ||
				left.targetLabel.localeCompare(right.targetLabel),
		);
}

function skillIconItemForArtifact(artifact: SkillArtifact): RepoSkillIconItem {
	const name = skillDisplayNameForArtifact(artifact);
	const visual = skillVisualForName(name);
	return {
		id: skillArtifactKey(artifact),
		name,
		targetLabel: artifactTargetLabel(artifact.artifactTarget),
		emoji: visual.emoji,
		background: visual.background,
	};
}

function skillArtifactKey(artifact: SkillArtifact): string {
	return artifact.repoRelativePath ?? artifact.path;
}

function skillDisplayNameForArtifact(artifact: SkillArtifact): string {
	if (artifact.name) {
		return artifact.name;
	}
	const relativePath = artifact.repoRelativePath ?? artifact.path;
	const fileName = pathBaseName(relativePath);
	if (fileName === "AGENTS.md" || fileName === "CLAUDE.md") {
		return fileName;
	}
	if (fileName?.endsWith(".mdc")) {
		return fileName.replace(/\.mdc$/, "");
	}
	return skillFolderName(relativePath) ?? fileName ?? "Skill";
}

function artifactTargetLabel(
	artifactTarget: SkillArtifact["artifactTarget"],
): string {
	switch (artifactTarget) {
		case "agents_md":
			return "AGENTS.md";
		case "claude_code":
			return "Claude Code";
		case "claude_md":
			return "CLAUDE.md";
		case "codex":
			return "Codex";
		case "cursor":
			return "Cursor";
		case "unknown":
			return "Skill file";
	}
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
	dashboardTableRight: {
		width: 140,
		color: "#737373",
		textAlign: "right",
	} satisfies CSSProperties,
	dashboardRepoCell: {
		width: "100%",
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 18,
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
		minWidth: 0,
		flex: "0 0 auto",
		border: 0,
		margin: "0 0 0 auto",
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		padding: "0 0 0 10px",
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
	skillIconTooltipTitle: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: 650,
		lineHeight: 1.35,
	} satisfies CSSProperties,
	skillIconTooltipMeta: {
		marginTop: 2,
		color: "rgba(255, 255, 255, 0.68)",
		fontSize: 11,
		fontWeight: 500,
		lineHeight: 1.35,
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
	skillNameButton: {
		minWidth: 0,
		maxWidth: "100%",
		border: 0,
		background: "transparent",
		color: "#171717",
		cursor: "pointer",
		font: "inherit",
		fontSize: 13,
		fontWeight: 500,
		letterSpacing: 0,
		margin: 0,
		overflow: "hidden",
		padding: 0,
		textAlign: "left",
		textDecoration: "none",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	skillDetailPage: {
		flex: "1 1 auto",
		minWidth: 0,
		minHeight: 0,
		display: "flex",
		flexDirection: "column",
		paddingTop: 18,
	} satisfies CSSProperties,
	breadcrumb: {
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: 4,
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		lineHeight: "20px",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	breadcrumbButton: {
		border: 0,
		borderRadius: 6,
		background: "transparent",
		color: "#525252",
		cursor: "pointer",
		font: "inherit",
		letterSpacing: 0,
		margin: 0,
		minWidth: 0,
		padding: "0 4px",
	} satisfies CSSProperties,
	breadcrumbSeparator: {
		color: "#a3a3a3",
	} satisfies CSSProperties,
	breadcrumbCurrent: {
		minWidth: 0,
		color: "#171717",
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
		maxHeight: "calc(100svh - 126px)",
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
	repoTitleLink: {
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
