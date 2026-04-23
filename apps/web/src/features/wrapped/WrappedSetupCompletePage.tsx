import type { ReactNode } from "react";
import type { DeveloperProject } from "@rudel/api-routes";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	useReducedMotion,
} from "motion/react";
import { useMemo, useState } from "react";
import { WrappedSetupCommandSurface } from "@/components/analytics/CliSetupCommandSurface";
import { cliSetupCommands } from "@/components/analytics/CliSetupHint";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import { orpc } from "@/lib/orpc";
import { WrappedRouteStageShell } from "./route-stage-shell";

interface WrappedSetupCompletePageProps {
	debugControls?: ReactNode;
	onBack?: () => void;
	onContinue: () => void;
	reposOverride?: WrappedUploadedRepoRow[];
	totalSessionCount: number;
	userId: string;
}

export function WrappedSetupCompletePage(props: WrappedSetupCompletePageProps) {
	const [isUploadMoreVisible, setIsUploadMoreVisible] = useState(false);
	const hasReposOverride = props.reposOverride !== undefined;
	const { data: projects, isLoading } = useAnalyticsQuery({
		...orpc.analytics.developers.projects.queryOptions({
			input: {
				days: MAX_ANALYTICS_DAYS,
				userId: props.userId,
			},
		}),
		enabled: !hasReposOverride,
	});
	const uploadedRepos = useMemo(
		() =>
			props.reposOverride ??
			(projects ?? []).map((project) => ({
				name: getUploadedRepoName(project),
				projectPath: project.project_path,
				sessions: project.sessions,
			})),
		[projects, props.reposOverride],
	);

	return (
		<MotionConfig reducedMotion="user">
			<WrappedRouteStageShell
				description="Your first sessions are in."
				footerDebugControls={props.debugControls}
				footer={
					<div className="mymind-wrapped-action-stack">
						<WrappedPrimaryAction kind="button" onClick={props.onContinue}>
							See your story
						</WrappedPrimaryAction>
						<WrappedSecondaryAction
							aria-expanded={isUploadMoreVisible}
							onClick={() =>
								setIsUploadMoreVisible((currentValue) => !currentValue)
							}
						>
							Upload more
						</WrappedSecondaryAction>
					</div>
				}
				onBack={props.onBack}
				stageClassName="mymind-wrapped-entry-stage--setup-complete"
				progressStepId="sessions-landed"
				stage={
					<WrappedUploadedReposStage
						isLoading={hasReposOverride ? false : isLoading}
						isUploadMoreVisible={isUploadMoreVisible}
						repos={uploadedRepos}
						totalSessionCount={props.totalSessionCount}
					/>
				}
				title="Sessions landed"
			/>
		</MotionConfig>
	);
}

function WrappedUploadedReposStage(props: {
	isLoading: boolean;
	isUploadMoreVisible: boolean;
	repos: WrappedUploadedRepoRow[];
	totalSessionCount: number;
}) {
	if (props.isLoading) {
		return (
			<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--status">
				<div className="mymind-wrapped-entry-card__status-dot" />
				<p className="mymind-wrapped-entry-card__status-copy">
					Loading the repos that already sent sessions to Rudel.
				</p>
			</div>
		);
	}

	if (props.repos.length === 0) {
		return (
			<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--flat">
				<p className="mymind-wrapped-entry-card__body">
					{formatSessionCount(props.totalSessionCount)} uploaded. Repo names are
					still being resolved.
				</p>
			</div>
		);
	}

	return (
		<div
			className="mymind-wrapped-entry-card mymind-wrapped-entry-card--flat mymind-wrapped-uploaded-repos"
			data-upload-more-visible={props.isUploadMoreVisible ? "true" : "false"}
		>
			<div className="mymind-wrapped-uploaded-repos__summary">
				<p className="mymind-wrapped-uploaded-repos__summary-copy">
					{formatSessionCount(props.totalSessionCount)} across{" "}
					{formatRepoCount(props.repos.length)}
				</p>
			</div>

			<div className="mymind-wrapped-uploaded-repos__viewport">
				<ul
					aria-label="Uploaded repos"
					className="mymind-wrapped-uploaded-repos__list"
				>
					{props.repos.map((repo) => (
						<li
							key={repo.projectPath}
							className="mymind-wrapped-uploaded-repos__item"
						>
							<span className="mymind-wrapped-uploaded-repos__name">
								{repo.name}
							</span>
							<span className="mymind-wrapped-uploaded-repos__count">
								{formatSessionCount(repo.sessions)}
							</span>
						</li>
					))}
				</ul>
			</div>

			<WrappedUploadMorePanel isVisible={props.isUploadMoreVisible} />
		</div>
	);
}

export interface WrappedUploadedRepoRow {
	name: string;
	projectPath: string;
	sessions: number;
}

function getUploadedRepoName(project: DeveloperProject) {
	const packageName = project.package_name?.trim();
	if (packageName) {
		return packageName;
	}

	const remoteName = project.git_remote?.split("/").pop()?.trim();
	if (remoteName) {
		return remoteName.replace(/\.git$/i, "");
	}

	const normalizedProjectPath = project.project_path.replace(/\\/g, "/").trim();
	if (!normalizedProjectPath) {
		return "Unknown repo";
	}

	return (
		normalizedProjectPath.split("/").filter(Boolean).pop() ??
		normalizedProjectPath
	);
}

function formatRepoCount(count: number) {
	return `${count.toLocaleString()} repo${count === 1 ? "" : "s"}`;
}

function formatSessionCount(count: number) {
	return `${count.toLocaleString()} session${count === 1 ? "" : "s"}`;
}

function WrappedUploadMorePanel(props: { isVisible: boolean }) {
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;

	return (
		<AnimatePresence initial={false}>
			{props.isVisible ? (
				<motion.div
					key="upload-more-panel"
					animate={{ opacity: 1, height: "auto", y: 0 }}
					className="mymind-wrapped-upload-more-panel"
					exit={
						reduceMotion
							? { opacity: 0, height: 0 }
							: { opacity: 0, height: 0, y: 10 }
					}
					initial={
						reduceMotion
							? { opacity: 0, height: 0 }
							: { opacity: 0, height: 0, y: 10 }
					}
					transition={{
						duration: reduceMotion ? 0.16 : 0.22,
						ease: [0.22, 1, 0.36, 1],
					}}
				>
					<div className="mymind-wrapped-upload-more-panel__content">
						<div className="mymind-wrapped-upload-more-panel__commands">
							<WrappedSetupCommandSurface
								caption={UPLOAD_MORE_COMMANDS.primary.caption}
								className="mymind-wrapped-upload-more-panel__surface"
								command={UPLOAD_MORE_COMMANDS.primary.command}
							/>
							<div
								aria-hidden="true"
								className="mymind-wrapped-upload-more-panel__or"
							>
								or
							</div>
							<WrappedSetupCommandSurface
								caption={UPLOAD_MORE_COMMANDS.secondary.caption}
								className="mymind-wrapped-upload-more-panel__surface"
								command={UPLOAD_MORE_COMMANDS.secondary.command}
							/>
						</div>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

const UPLOAD_MORE_COMMANDS = getUploadMoreCommands();

function getUploadMoreCommands() {
	const uploadStep = cliSetupCommands.find(
		(step) => step.id === "enable-auto-upload",
	);

	if (!uploadStep || !uploadStep.alternateCommand) {
		throw new Error("Wrapped setup completion is missing upload commands.");
	}

	return {
		primary: {
			caption: "Auto upload future and historical sessions in the given repo",
			command: uploadStep.command,
		},
		secondary: {
			caption:
				uploadStep.alternateCommandCaption ??
				"Manually upload sessions from a repo",
			command: uploadStep.alternateCommand,
		},
	};
}
