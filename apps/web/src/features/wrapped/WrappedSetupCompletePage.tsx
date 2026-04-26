import type { DeveloperProject } from "@rudel/api-routes";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	useReducedMotion,
} from "motion/react";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { WrappedSetupCommandSurface } from "@/components/analytics/CliSetupCommandSurface";
import { cliSetupCommands } from "@/components/analytics/CliSetupHint";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	WrappedPrimaryAction,
	WrappedSecondaryAction,
} from "@/features/wrapped/actions";
import { shortenWrappedRepoLabelFromLeft } from "@/features/wrapped/repo-label";
import { useMountEffect } from "@/hooks/useMountEffect";
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

const SESSIONS_LANDED_EASE = [0.22, 1, 0.36, 1] as const;
const SESSIONS_LANDED_HANDOFF_MS = 1000;
const SESSIONS_LANDED_REDUCED_DURATION = 0.14;
const SESSIONS_LANDED_ROW_STAGGER = 0.035;
const UPLOADED_REPO_LABEL_MAX_LENGTH = 26;

export function WrappedSetupCompletePage(props: WrappedSetupCompletePageProps) {
	const [isUploadMoreVisible, setIsUploadMoreVisible] = useState(false);
	const [isContinuingToStory, setIsContinuingToStory] = useState(false);
	const reduceMotion = useReducedMotion() ?? false;
	const continueTimerRef = useRef<number | null>(null);
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
	const titleAnimate = isContinuingToStory
		? reduceMotion
			? { opacity: 0 }
			: { filter: "blur(10px)", opacity: 0, y: -10 }
		: reduceMotion
			? { opacity: 1 }
			: { filter: "blur(0px)", opacity: 1, y: 0 };
	const descriptionAnimate = isContinuingToStory
		? reduceMotion
			? { opacity: 0 }
			: { filter: "blur(8px)", opacity: 0, y: -8 }
		: reduceMotion
			? { opacity: 1 }
			: { filter: "blur(0px)", opacity: 1, y: 0 };
	const footerPrimaryAnimate = isContinuingToStory
		? reduceMotion
			? { opacity: 0 }
			: { filter: "blur(10px)", opacity: 0, y: -8 }
		: reduceMotion
			? { opacity: 1 }
			: { filter: "blur(0px)", opacity: 1, y: 0 };
	const footerSecondaryAnimate = isContinuingToStory
		? reduceMotion
			? { opacity: 0 }
			: { filter: "blur(8px)", opacity: 0, y: -6 }
		: reduceMotion
			? { opacity: 1 }
			: { filter: "blur(0px)", opacity: 1, y: 0 };

	useMountEffect(() => {
		return () => {
			if (continueTimerRef.current !== null) {
				window.clearTimeout(continueTimerRef.current);
			}
		};
	});

	function handleContinue() {
		if (isContinuingToStory) {
			return;
		}

		if (reduceMotion) {
			props.onContinue();
			return;
		}

		setIsContinuingToStory(true);
		continueTimerRef.current = window.setTimeout(() => {
			props.onContinue();
		}, SESSIONS_LANDED_HANDOFF_MS);
	}

	return (
		<MotionConfig reducedMotion="user">
			<WrappedRouteStageShell
				description={
					<motion.span
						animate={descriptionAnimate}
						initial={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(10px)", opacity: 0, y: 10 }
						}
						transition={
							isContinuingToStory
								? reduceMotion
									? {
											duration: SESSIONS_LANDED_REDUCED_DURATION,
											ease: "linear",
										}
									: {
											duration: 0.18,
											ease: SESSIONS_LANDED_EASE,
										}
								: reduceMotion
									? {
											delay: 0.12,
											duration: SESSIONS_LANDED_REDUCED_DURATION,
											ease: "linear",
										}
									: {
											delay: 0.18,
											duration: 0.24,
											ease: SESSIONS_LANDED_EASE,
										}
						}
					>
						Are you ready to see what the sessions tell about you?
					</motion.span>
				}
				footerDebugControls={props.debugControls}
				footer={
					<div className="mymind-wrapped-action-stack">
						<motion.div
							animate={footerPrimaryAnimate}
							initial={
								reduceMotion
									? { opacity: 0 }
									: { filter: "blur(8px)", opacity: 0, y: 10 }
							}
							transition={
								isContinuingToStory
									? reduceMotion
										? {
												duration: SESSIONS_LANDED_REDUCED_DURATION,
												ease: "linear",
											}
										: {
												duration: 0.18,
												ease: SESSIONS_LANDED_EASE,
											}
									: reduceMotion
										? {
												delay: 0.16,
												duration: SESSIONS_LANDED_REDUCED_DURATION,
												ease: "linear",
											}
										: {
												delay: 0.3,
												duration: 0.24,
												ease: SESSIONS_LANDED_EASE,
											}
							}
						>
							<WrappedPrimaryAction
								kind="button"
								disabled={isContinuingToStory}
								onClick={handleContinue}
							>
								See what it reveals about you
							</WrappedPrimaryAction>
						</motion.div>
						<motion.div
							animate={footerSecondaryAnimate}
							initial={
								reduceMotion
									? { opacity: 0 }
									: { filter: "blur(10px)", opacity: 0, y: 12 }
							}
							transition={
								isContinuingToStory
									? reduceMotion
										? {
												duration: SESSIONS_LANDED_REDUCED_DURATION,
												ease: "linear",
											}
										: {
												duration: 0.16,
												ease: SESSIONS_LANDED_EASE,
											}
									: reduceMotion
										? {
												delay: 0.18,
												duration: SESSIONS_LANDED_REDUCED_DURATION,
												ease: "linear",
											}
										: {
												delay: 0.36,
												duration: 0.22,
												ease: SESSIONS_LANDED_EASE,
											}
							}
						>
							<WrappedSecondaryAction
								aria-expanded={isUploadMoreVisible}
								disabled={isContinuingToStory}
								onClick={() =>
									setIsUploadMoreVisible((currentValue) => !currentValue)
								}
							>
								Upload more for a better picture
							</WrappedSecondaryAction>
						</motion.div>
					</div>
				}
				onBack={isContinuingToStory ? () => {} : props.onBack}
				stageClassName="mymind-wrapped-entry-stage--setup-complete"
				progressStepId="sessions-landed"
				stage={
					<WrappedUploadedReposStage
						isLoading={hasReposOverride ? false : isLoading}
						isContinuingToStory={isContinuingToStory}
						isUploadMoreVisible={isUploadMoreVisible}
						reduceMotion={reduceMotion}
						repos={uploadedRepos}
						totalSessionCount={props.totalSessionCount}
					/>
				}
				title={
					<motion.span
						animate={titleAnimate}
						initial={
							reduceMotion
								? { opacity: 0 }
								: { filter: "blur(14px)", opacity: 0, y: 12 }
						}
						transition={
							isContinuingToStory
								? reduceMotion
									? {
											duration: SESSIONS_LANDED_REDUCED_DURATION,
											ease: "linear",
										}
									: {
											duration: 0.18,
											ease: SESSIONS_LANDED_EASE,
										}
								: reduceMotion
									? {
											delay: 0.08,
											duration: SESSIONS_LANDED_REDUCED_DURATION,
											ease: "linear",
										}
									: {
											delay: 0.1,
											duration: 0.32,
											ease: SESSIONS_LANDED_EASE,
										}
						}
					>
						Sessions landed
					</motion.span>
				}
			/>
			<AnimatePresence initial={false}>
				{isContinuingToStory && !reduceMotion ? (
					<motion.div
						key="sessions-landed-white-interstitial"
						animate={{ opacity: 1 }}
						aria-hidden="true"
						className="pointer-events-none fixed inset-0 z-[40] bg-white"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						transition={{ duration: 0.06, ease: "linear" }}
					/>
				) : null}
			</AnimatePresence>
		</MotionConfig>
	);
}

function WrappedUploadedReposStage(props: {
	isContinuingToStory: boolean;
	isLoading: boolean;
	isUploadMoreVisible: boolean;
	reduceMotion: boolean;
	repos: WrappedUploadedRepoRow[];
	totalSessionCount: number;
}) {
	const cardAnimate = props.isContinuingToStory
		? props.reduceMotion
			? { opacity: 0 }
			: { filter: "blur(10px)", opacity: 0, scale: 1.01, y: -14 }
		: props.reduceMotion
			? { opacity: 1 }
			: { filter: "blur(0px)", opacity: 1, scale: 1, y: 0 };
	const cardInitial = props.reduceMotion
		? { opacity: 0 }
		: { filter: "blur(8px)", opacity: 0, scale: 0.982, y: 20 };
	const cardTransition = props.isContinuingToStory
		? props.reduceMotion
			? {
					duration: SESSIONS_LANDED_REDUCED_DURATION,
					ease: "linear" as const,
				}
			: {
					duration: 0.18,
					ease: SESSIONS_LANDED_EASE,
				}
		: props.reduceMotion
			? {
					delay: 0.08,
					duration: SESSIONS_LANDED_REDUCED_DURATION,
					ease: "linear" as const,
				}
			: {
					delay: 0.18,
					duration: 0.42,
					ease: SESSIONS_LANDED_EASE,
				};

	if (props.isLoading) {
		return (
			<motion.div
				animate={cardAnimate}
				className="mymind-wrapped-entry-card mymind-wrapped-entry-card--status"
				initial={cardInitial}
				transition={cardTransition}
			>
				<div className="mymind-wrapped-entry-card__status-dot" />
				<p className="mymind-wrapped-entry-card__status-copy">
					Loading the repos that already sent sessions to Rudel.
				</p>
			</motion.div>
		);
	}

	if (props.repos.length === 0) {
		return (
			<motion.div
				animate={cardAnimate}
				className="mymind-wrapped-entry-card mymind-wrapped-entry-card--flat"
				initial={cardInitial}
				transition={cardTransition}
			>
				<p className="mymind-wrapped-entry-card__body">
					{formatSessionCount(props.totalSessionCount)} uploaded. Repo names are
					still being resolved.
				</p>
			</motion.div>
		);
	}

	return (
		<motion.div
			animate={cardAnimate}
			className="mymind-wrapped-entry-card mymind-wrapped-entry-card--flat mymind-wrapped-uploaded-repos"
			data-upload-more-visible={props.isUploadMoreVisible ? "true" : "false"}
			initial={cardInitial}
			transition={cardTransition}
		>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="mymind-wrapped-uploaded-repos__summary"
				initial={props.reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
				transition={
					props.reduceMotion
						? {
								delay: 0.12,
								duration: SESSIONS_LANDED_REDUCED_DURATION,
								ease: "linear",
							}
						: {
								delay: 0.24,
								duration: 0.24,
								ease: SESSIONS_LANDED_EASE,
							}
				}
			>
				<p className="mymind-wrapped-uploaded-repos__summary-copy">
					{formatSessionCount(props.totalSessionCount)} across{" "}
					{formatRepoCount(props.repos.length)}
				</p>
			</motion.div>

			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="mymind-wrapped-uploaded-repos__viewport"
				initial={props.reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
				transition={
					props.reduceMotion
						? {
								delay: 0.14,
								duration: SESSIONS_LANDED_REDUCED_DURATION,
								ease: "linear",
							}
						: {
								delay: 0.28,
								duration: 0.28,
								ease: SESSIONS_LANDED_EASE,
							}
				}
			>
				<ul
					aria-label="Uploaded repos"
					className="mymind-wrapped-uploaded-repos__list"
				>
					{props.repos.map((repo, index) => (
						<motion.li
							animate={{ opacity: 1, y: 0 }}
							key={repo.projectPath}
							className="mymind-wrapped-uploaded-repos__item"
							initial={
								props.reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }
							}
							transition={
								props.reduceMotion
									? {
											delay: 0.16,
											duration: SESSIONS_LANDED_REDUCED_DURATION,
											ease: "linear",
										}
									: {
											delay:
												0.34 + Math.min(index, 6) * SESSIONS_LANDED_ROW_STAGGER,
											duration: 0.22,
											ease: SESSIONS_LANDED_EASE,
										}
							}
						>
							<span
								className="mymind-wrapped-uploaded-repos__name"
								title={repo.name}
							>
								{shortenWrappedRepoLabelFromLeft(
									repo.name,
									UPLOADED_REPO_LABEL_MAX_LENGTH,
								)}
							</span>
							<span className="mymind-wrapped-uploaded-repos__count">
								{formatSessionCount(repo.sessions)}
							</span>
						</motion.li>
					))}
				</ul>
			</motion.div>

			<WrappedUploadMorePanel isVisible={props.isUploadMoreVisible} />
		</motion.div>
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
