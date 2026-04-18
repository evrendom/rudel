import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import {
	ArrowLeft,
	BrainCircuit,
	ChevronLeft,
	ChevronRight,
	Command,
	Flame,
	FolderKanban,
	Goal,
	House,
	Shield,
	Sparkles,
	Swords,
	Trophy,
	Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import { appRoutes } from "@/app/routes";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import {
	type WrappedDiagnostics,
	type FifaWrappedStoryData,
	useFifaWrappedData,
} from "@/features/wrapped/use-fifa-wrapped-data";
import {
	formatCompactNumber,
	formatCompactWholeNumber,
	formatCurrency,
	formatDateLabel,
	formatPercent,
	formatWholeCurrency,
} from "@/lib/format";
import "@/features/wrapped/fifa-wrapped.css";

const SLIDE_IDS = [
	"hero",
	"card",
	"records",
	"style",
	"club",
	"finale",
] as const;

type SlideId = (typeof SLIDE_IDS)[number];

function formatDurationLabel(totalMinutes: number) {
	const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
	const hours = Math.floor(normalizedMinutes / 60);
	const minutes = normalizedMinutes % 60;

	if (hours <= 0) {
		return `${minutes}m`;
	}

	if (minutes <= 0) {
		return `${hours}h`;
	}

	return `${hours}h ${minutes}m`;
}

function formatCompactTokenLabel(totalTokens: number) {
	return formatCompactWholeNumber(totalTokens);
}

function formatTrendLabel(successRateTrend: number) {
	if (successRateTrend > 0) {
		return `+${successRateTrend.toFixed(1)} success`;
	}

	if (successRateTrend < 0) {
		return `${successRateTrend.toFixed(1)} success`;
	}

	return "Flat form";
}

function buildRankLabel(rank: number | null, workspaceSize: number, fallback: string) {
	if (!rank || workspaceSize <= 0) {
		return fallback;
	}

	return `#${rank} / ${workspaceSize}`;
}

function StatPill({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="fifa-wrapped-pill">
			<div className="fifa-wrapped-pill__icon">{icon}</div>
			<div>
				<div className="fifa-wrapped-pill__label">{label}</div>
				<div className="fifa-wrapped-pill__value">{value}</div>
			</div>
		</div>
	);
}

function RecordTile({
	label,
	value,
	context,
	tone = "default",
}: {
	context: string;
	label: string;
	tone?: "default" | "highlight";
	value: string;
}) {
	return (
		<div className={`fifa-wrapped-record ${tone === "highlight" ? "is-highlight" : ""}`}>
			<div className="fifa-wrapped-record__label">{label}</div>
			<div className="fifa-wrapped-record__value">{value}</div>
			<div className="fifa-wrapped-record__context">{context}</div>
		</div>
	);
}

function AttributeRow({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="fifa-wrapped-attribute">
			<div className="fifa-wrapped-attribute__rating">{value}</div>
			<div className="fifa-wrapped-attribute__name">{label}</div>
		</div>
	);
}

function HeroSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--hero">
			<div className="fifa-wrapped-hero-copy">
				<div className="fifa-wrapped-kicker">Rudel Ultimate Team</div>
				<h1 className="fifa-wrapped-hero-title">
					<span>{story.firstName},</span>
					<span>your AI season is ready.</span>
				</h1>
				<p className="fifa-wrapped-hero-summary">
					A Spotify-style walkout built from your actual analytics, with a FIFA
					card spine and zero WebGL baggage.
				</p>
				<div className="fifa-wrapped-hero-badges">
					<span className="fifa-wrapped-chip">OVR {story.overallRating}</span>
					<span className="fifa-wrapped-chip">{story.seasonRole}</span>
					<span className="fifa-wrapped-chip">{story.periodLabel}</span>
				</div>
			</div>
			<div className="fifa-wrapped-hero-scoreboard">
				<StatPill
					icon={<Trophy className="size-4" />}
					label="Token rank"
					value={buildRankLabel(
						story.ranks.tokenRank,
						story.workspaceSize,
						"Unranked",
					)}
				/>
				<StatPill
					icon={<Zap className="size-4" />}
					label="Total tokens"
					value={formatCompactTokenLabel(story.totalTokens)}
				/>
				<StatPill
					icon={<Goal className="size-4" />}
					label="Commits logged"
					value={formatCompactNumber(story.totalCommits)}
				/>
			</div>
		</div>
	);
}

function CardSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--card">
			<div className="fifa-player-card">
				<div className="fifa-player-card__shine" />
				<div className="fifa-player-card__overall">{story.overallRating}</div>
				<div className="fifa-player-card__position">AI</div>
				<div className="fifa-player-card__portrait">
					{story.imageUrl ? (
						<img src={story.imageUrl} alt={story.displayName} />
					) : (
						<div className="fifa-player-card__initials">{story.initials}</div>
					)}
				</div>
				<div className="fifa-player-card__name">{story.displayName}</div>
				<div className="fifa-player-card__meta">
					<div className="fifa-player-card__role">{story.seasonRole}</div>
					<div className="fifa-player-card__skill">{story.topSkill}</div>
					<div className="fifa-player-card__model">
						{story.favoriteModel ? (
							<DashboardModelBadges models={[story.favoriteModel]} />
						) : (
							<span>Model scouting in progress</span>
						)}
					</div>
				</div>
				<div className="fifa-player-card__attributes">
					<AttributeRow
						label="TOK"
						value={formatCompactTokenLabel(story.totalTokens)}
					/>
					<AttributeRow
						label="CST"
						value={formatWholeCurrency(story.totalCost)}
					/>
					<AttributeRow
						label="SES"
						value={formatCompactNumber(story.sessionCount)}
					/>
					<AttributeRow
						label="DYS"
						value={formatCompactNumber(story.activeDays)}
					/>
					<AttributeRow
						label="CMD"
						value={formatCompactNumber(story.totalCommits)}
					/>
					<AttributeRow label="WIN" value={formatPercent(story.successRate)} />
				</div>
			</div>
			<div className="fifa-wrapped-side-panel">
				<div className="fifa-wrapped-section-title">Season card</div>
				<h2 className="fifa-wrapped-panel-heading">
					Your base card is built from real output, not vibes.
				</h2>
				<div className="fifa-wrapped-panel-grid">
					<RecordTile
						label="Total spend"
						value={formatCurrency(story.totalCost)}
						context={`${formatTrendLabel(story.successRateTrend)} over the period`}
					/>
					<RecordTile
						label="Session average"
						value={formatDurationLabel(story.avgSessionDurationMin)}
						context={`${formatCompactNumber(story.sessionCount)} sessions played`}
					/>
					<RecordTile
						label="Projects"
						value={formatCompactNumber(story.distinctProjects)}
						context={`${formatCompactNumber(story.repositoryCount)} repositories touched`}
					/>
					<RecordTile
						label="Last active"
						value={story.lastActiveDate ? formatDateLabel(story.lastActiveDate) : "N/A"}
						context="Most recent tracked matchday"
					/>
				</div>
			</div>
		</div>
	);
}

function RecordsSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--records">
			<div className="fifa-wrapped-section-title">Season records</div>
			<h2 className="fifa-wrapped-panel-heading">
				The moments that actually defined your year.
			</h2>
			<div className="fifa-wrapped-record-grid">
				<RecordTile
					label="Longest session"
					value={formatDurationLabel(story.longestSessionMin)}
					context="Single-session endurance"
					tone="highlight"
				/>
				<RecordTile
					label="Longest streak"
					value={`${story.longestStreakDays} days`}
					context="Consecutive active days"
				/>
				<RecordTile
					label="Peak token day"
					value={formatCompactTokenLabel(story.peakDayTokens)}
					context={
						story.peakDayDate
							? `${formatDateLabel(story.peakDayDate)} with ${formatCompactNumber(story.peakDaySessions)} sessions`
							: "No day peak captured"
					}
				/>
				<RecordTile
					label="Biggest session"
					value={formatCompactTokenLabel(story.topSessionTokens)}
					context="Highest single-session token volume"
				/>
				<RecordTile
					label="Top project"
					value={story.topProjectName}
					context={`${formatCompactTokenLabel(story.topProjectTokens)} tokens across ${formatCompactNumber(story.topProjectSessions)} sessions`}
				/>
				<RecordTile
					label="Hours on pitch"
					value={formatCompactNumber(story.totalDurationMin / 60)}
					context="Total logged coding hours"
				/>
			</div>
		</div>
	);
}

function StyleSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--style">
			<div>
				<div className="fifa-wrapped-section-title">Play style</div>
				<h2 className="fifa-wrapped-panel-heading">
					What your toolset says about how you build.
				</h2>
			</div>
			<div className="fifa-wrapped-style-grid">
				<RecordTile
					label="Top skill"
					value={story.topSkill}
					context={`${formatCompactNumber(story.distinctSkills)} distinct skills in the bag`}
					tone="highlight"
				/>
				<RecordTile
					label="Top slash command"
					value={story.topSlashCommand}
					context={`${formatCompactNumber(story.distinctSlashCommands)} command families used`}
				/>
				<RecordTile
					label="Top subagent"
					value={story.topSubagent}
					context={`${formatPercent(story.featureAdoptionRates.subagents)} subagent adoption`}
				/>
				<RecordTile
					label="Dominant archetype"
					value={story.dominantArchetype}
					context="Most common session profile"
				/>
			</div>
			<div className="fifa-wrapped-meter-panel">
				<div className="fifa-wrapped-meter">
					<div className="fifa-wrapped-meter__label">
						<BrainCircuit className="size-4" />
						<span>Plan mode</span>
					</div>
					<div className="fifa-wrapped-meter__track">
						<div
							className="fifa-wrapped-meter__fill"
							style={{ width: `${Math.max(6, Math.min(100, story.planModeRate))}%` }}
						/>
					</div>
					<div className="fifa-wrapped-meter__value">
						{formatPercent(story.planModeRate)}
					</div>
				</div>
				<div className="fifa-wrapped-meter">
					<div className="fifa-wrapped-meter__label">
						<Goal className="size-4" />
						<span>Commit rate</span>
					</div>
					<div className="fifa-wrapped-meter__track">
						<div
							className="fifa-wrapped-meter__fill is-gold"
							style={{ width: `${Math.max(6, Math.min(100, story.commitRate))}%` }}
						/>
					</div>
					<div className="fifa-wrapped-meter__value">
						{formatPercent(story.commitRate)}
					</div>
				</div>
				<div className="fifa-wrapped-meter">
					<div className="fifa-wrapped-meter__label">
						<Command className="size-4" />
						<span>Slash command adoption</span>
					</div>
					<div className="fifa-wrapped-meter__track">
						<div
							className="fifa-wrapped-meter__fill is-lime"
							style={{
								width: `${Math.max(
									6,
									Math.min(100, story.featureAdoptionRates.slashCommands),
								)}%`,
							}}
						/>
					</div>
					<div className="fifa-wrapped-meter__value">
						{formatPercent(story.featureAdoptionRates.slashCommands)}
					</div>
				</div>
			</div>
		</div>
	);
}

function ClubSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--club">
			<div className="fifa-wrapped-club-panel">
				<div className="fifa-wrapped-section-title">Club table</div>
				<h2 className="fifa-wrapped-panel-heading">
					How you stack up inside the workspace.
				</h2>
				<div className="fifa-wrapped-ranking-grid">
					<RecordTile
						label="Token rank"
						value={buildRankLabel(story.ranks.tokenRank, story.workspaceSize, "N/A")}
						context={`${formatCompactTokenLabel(story.totalTokens)} across the season`}
						tone="highlight"
					/>
					<RecordTile
						label="Spend rank"
						value={buildRankLabel(story.ranks.spendRank, story.workspaceSize, "N/A")}
						context={formatCurrency(story.totalCost)}
					/>
					<RecordTile
						label="Sessions rank"
						value={buildRankLabel(
							story.ranks.sessionRank,
							story.workspaceSize,
							"N/A",
						)}
						context={`${formatCompactNumber(story.sessionCount)} sessions`}
					/>
					<RecordTile
						label="Commit rank"
						value={buildRankLabel(
							story.ranks.commitRank,
							story.workspaceSize,
							"N/A",
						)}
						context={`${formatCompactNumber(story.totalCommits)} commits`}
					/>
				</div>
			</div>
			<div className="fifa-wrapped-club-sidebar">
				<StatPill
					icon={<FolderKanban className="size-4" />}
					label="Repositories touched"
					value={formatCompactNumber(story.repositoryCount)}
				/>
				<StatPill
					icon={<Sparkles className="size-4" />}
					label="Models rotated"
					value={formatCompactNumber(story.modelCount)}
				/>
				<StatPill
					icon={<Shield className="size-4" />}
					label="Success rate"
					value={formatPercent(story.successRate)}
				/>
				<StatPill
					icon={<Flame className="size-4" />}
					label="Primary error"
					value={story.primaryErrorPattern ? "Tracked" : "Clean sheet"}
				/>
				<div className="fifa-wrapped-repo-stack">
					<div className="fifa-wrapped-repo-stack__label">Featured repositories</div>
					{story.repositoriesTouched.slice(0, 3).map((repository) => (
						<div key={repository} className="fifa-wrapped-repo-chip">
							{repository.split("/").pop() || repository}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function FinaleSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--finale">
			<div className="fifa-wrapped-finale-mark">
				<Trophy className="size-8" />
			</div>
			<div className="fifa-wrapped-section-title">Final whistle</div>
			<h2 className="fifa-wrapped-panel-heading">
				{story.firstName} closes the year as a {story.seasonRole}.
			</h2>
			<p className="fifa-wrapped-finale-copy">
				{formatCompactTokenLabel(story.totalTokens)} tokens,{" "}
				{formatCompactNumber(story.totalCommits)} commits,{" "}
				{story.longestStreakDays} straight days on the grind, and an{" "}
				OVR {story.overallRating} card to prove it.
			</p>
			<div className="fifa-wrapped-finale-actions">
				<Link className="fifa-wrapped-link-button" to={appRoutes.dashboard()}>
					<House className="size-4" />
					Back to dashboard
				</Link>
				<Link className="fifa-wrapped-link-button is-secondary" to={appRoutes.team()}>
					<Swords className="size-4" />
					Open team page
				</Link>
			</div>
		</div>
	);
}

function LoadingState() {
	return (
		<div className="fifa-wrapped-loading">
			<div className="fifa-wrapped-loading__crest" />
			<div className="fifa-wrapped-loading__title">Assembling your season card</div>
			<div className="fifa-wrapped-loading__copy">
				Pulling real analytics, rankings, and story beats into the tunnel.
			</div>
		</div>
	);
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "The route is wired, but the analytics payload did not resolve cleanly in this environment.";
}

function createMissingStoryError() {
	return new Error("Wrapped data loaded, but the story card could not be assembled.");
}

function buildDiagnosticsLogKey({
	diagnostics,
	error,
	isError,
	isLoading,
	story,
}: {
	diagnostics: WrappedDiagnostics;
	error: unknown;
	isError: boolean;
	isLoading: boolean;
	story: FifaWrappedStoryData | null;
}) {
	const failingQueries = diagnostics.queries
		.filter((query) => query.isError)
		.map((query) => `${query.name}:${query.errorMessage ?? "unknown"}`);
	const unresolvedQueries = isLoading
		? []
		: diagnostics.queries
				.filter((query) => !query.isPending && !query.isError && !query.hasData)
				.map((query) => query.name);

	if (!isError && failingQueries.length === 0 && unresolvedQueries.length === 0 && story) {
		return null;
	}

	if (!isError && failingQueries.length === 0 && unresolvedQueries.length === 0 && isLoading) {
		return null;
	}

	return [
		diagnostics.currentUserId ?? "anonymous",
		diagnostics.activeOrgId ?? "no-org",
		isError ? `route:${getErrorMessage(error)}` : "route:ok",
		isLoading ? "loading" : "settled",
		story ? "story:yes" : "story:no",
		...failingQueries,
		...unresolvedQueries.map((name) => `missing:${name}`),
	].join("|");
}

function WrappedDiagnosticsLogger({
	diagnostics,
	error,
	isError,
	isLoading,
	story,
}: {
	diagnostics: WrappedDiagnostics;
	error: unknown;
	isError: boolean;
	isLoading: boolean;
	story: FifaWrappedStoryData | null;
}) {
	useMountEffect(() => {
		const failingQueries = diagnostics.queries.filter((query) => query.isError);
		const unresolvedQueries = isLoading
			? []
			: diagnostics.queries.filter(
					(query) => !query.isPending && !query.isError && !query.hasData,
				);

		console.groupCollapsed("[wrapped] diagnostics");
		console.log("context", {
			activeOrgId: diagnostics.activeOrgId,
			currentUserId: diagnostics.currentUserId,
			isLoading,
			isSessionPending: diagnostics.isSessionPending,
			isWorkspaceLoading: diagnostics.isWorkspaceLoading,
			isError,
			storyReady: Boolean(story),
		});

		if (isError) {
			console.error("route", {
				error,
				message: getErrorMessage(error),
			});
		}

		if (!isLoading && !story && !isError) {
			console.warn("story", "Wrapped data loaded, but no story was assembled.");
		}

		for (const query of failingQueries) {
			console.error(query.name, {
				error: query.error,
				errorMessage: query.errorMessage,
				hasData: query.hasData,
				isPending: query.isPending,
			});
		}

		for (const query of unresolvedQueries) {
			console.warn(query.name, {
				error: query.error,
				errorMessage: query.errorMessage,
				hasData: query.hasData,
				isPending: query.isPending,
			});
		}

		console.log(
			"queries",
			diagnostics.queries.map((query) => ({
				errorMessage: query.errorMessage,
				hasData: query.hasData,
				isError: query.isError,
				isPending: query.isPending,
				name: query.name,
			})),
		);
		console.groupEnd();
	});

	return null;
}

function ErrorState({
	error,
	onBack,
}: {
	error: unknown;
	onBack: () => void;
}) {
	return (
		<div className="fifa-wrapped-loading">
			<div className="fifa-wrapped-loading__title">Wrapped unavailable</div>
			<div className="fifa-wrapped-loading__copy">{getErrorMessage(error)}</div>
			<Button onClick={onBack} variant="outline">
				<ArrowLeft className="size-4" />
				Return
			</Button>
		</div>
	);
}

function renderSlide(slideId: SlideId, story: FifaWrappedStoryData) {
	switch (slideId) {
		case "hero":
			return <HeroSlide story={story} />;
		case "card":
			return <CardSlide story={story} />;
		case "records":
			return <RecordsSlide story={story} />;
		case "style":
			return <StyleSlide story={story} />;
		case "club":
			return <ClubSlide story={story} />;
		case "finale":
			return <FinaleSlide story={story} />;
		default:
			return null;
	}
}

export function FifaWrappedPage() {
	const navigate = useNavigate();
	const { diagnostics, error, isError, isLoading, story } = useFifaWrappedData();
	const [activeSlideIndex, setActiveSlideIndex] = React.useState(0);
	const activeSlideId = SLIDE_IDS[activeSlideIndex] ?? SLIDE_IDS[0];
	const isStoryReady = Boolean(story) && !isLoading && !isError;
	const diagnosticsLogKey = buildDiagnosticsLogKey({
		diagnostics,
		error,
		isError,
		isLoading,
		story,
	});

	const goBackFromEffect = React.useEffectEvent(() => {
		setActiveSlideIndex((currentIndex) => Math.max(0, currentIndex - 1));
	});
	const goForwardFromEffect = React.useEffectEvent(() => {
		setActiveSlideIndex((currentIndex) =>
			Math.min(SLIDE_IDS.length - 1, currentIndex + 1),
		);
	});

	function goBack() {
		if (!isStoryReady) {
			return;
		}

		setActiveSlideIndex((currentIndex) => Math.max(0, currentIndex - 1));
	}

	function goForward() {
		if (!isStoryReady) {
			return;
		}

		setActiveSlideIndex((currentIndex) =>
			Math.min(SLIDE_IDS.length - 1, currentIndex + 1),
		);
	}

	React.useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (!isStoryReady && event.key !== "Escape") {
				return;
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				goBackFromEffect();
				return;
			}

			if (
				event.key === "ArrowRight" ||
				event.key === " " ||
				event.key === "Enter"
			) {
				event.preventDefault();
				goForwardFromEffect();
				return;
			}

			if (event.key === "Escape") {
				event.preventDefault();
				navigate(appRoutes.dashboard());
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isStoryReady, navigate]);

	return (
		<div className="fifa-wrapped-route">
			{diagnosticsLogKey ? (
				<WrappedDiagnosticsLogger
					key={diagnosticsLogKey}
					diagnostics={diagnostics}
					error={error}
					isError={isError}
					isLoading={isLoading}
					story={story}
				/>
			) : null}
			<div className="fifa-wrapped-route__mesh" />
			<div className="fifa-wrapped-route__lights" />
			<div className="fifa-wrapped-shell">
				<header className="fifa-wrapped-header">
					<button
						type="button"
						className="fifa-wrapped-header__action"
						onClick={() => navigate(appRoutes.dashboard())}
					>
						<ArrowLeft className="size-4" />
						Exit tunnel
					</button>
					<div className="fifa-wrapped-progress">
						{SLIDE_IDS.map((slideId, slideIndex) => (
							<button
								key={slideId}
								type="button"
								className={`fifa-wrapped-progress__dot ${
									slideIndex === activeSlideIndex ? "is-active" : ""
								}`}
								aria-label={`Go to slide ${slideIndex + 1}`}
								disabled={!isStoryReady}
								onClick={() => setActiveSlideIndex(slideIndex)}
							/>
						))}
					</div>
					<div className="fifa-wrapped-header__meta">
						<div>WRAPPED</div>
						<div>{activeSlideIndex + 1} / {SLIDE_IDS.length}</div>
					</div>
				</header>
					<main className="fifa-wrapped-main">
						{isError ? (
							<ErrorState
								error={error}
								onBack={() => navigate(appRoutes.dashboard())}
							/>
						) : isLoading ? (
							<LoadingState />
						) : !story ? (
							<ErrorState
								error={createMissingStoryError()}
								onBack={() => navigate(appRoutes.dashboard())}
							/>
						) : (
						<AnimatePresence mode="wait" initial={false}>
							<motion.section
								key={activeSlideId}
								className="fifa-wrapped-stage"
								initial={{ opacity: 0, x: 36, scale: 0.985 }}
								animate={{ opacity: 1, x: 0, scale: 1 }}
								exit={{ opacity: 0, x: -36, scale: 0.985 }}
								transition={{
									duration: 0.38,
									ease: [0.23, 1, 0.32, 1],
								}}
							>
								{renderSlide(activeSlideId, story)}
							</motion.section>
						</AnimatePresence>
					)}
				</main>
				<footer className="fifa-wrapped-footer">
					<Button
						variant="outline"
						onClick={goBack}
						disabled={!isStoryReady || activeSlideIndex === 0}
					>
						<ChevronLeft className="size-4" />
						Previous
					</Button>
					<div className="fifa-wrapped-footer__hint">
						Use arrow keys to move through the story.
					</div>
					<Button
						onClick={goForward}
						disabled={!isStoryReady || activeSlideIndex === SLIDE_IDS.length - 1}
					>
						Next
						<ChevronRight className="size-4" />
					</Button>
				</footer>
			</div>
		</div>
	);
}
