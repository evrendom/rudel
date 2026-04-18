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
import {
	AnimatePresence,
	animate,
	motion,
	stagger,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { appRoutes } from "@/app/routes";
import { Button } from "@/app/ui/button";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import {
	type FifaWrappedStoryData,
	useFifaWrappedData,
	type WrappedDiagnostics,
} from "@/features/wrapped/use-fifa-wrapped-data";
import { WrappedTunnelCanvas } from "@/features/wrapped/WrappedTunnelCanvas";
import {
	formatCompactNumber,
	formatCompactWholeNumber,
	formatCurrency,
	formatDateLabel,
	formatPercent,
	formatWholeCurrency,
} from "@/lib/format";
import "@/features/wrapped/fifa-wrapped.css";

/* ─────────────────────────────────────────────────────────
 * WRAPPED METRIC STORYBOARD
 *
 * Read top-to-bottom. Each mount of a slide replays this.
 *
 *    0ms   slide shell lands in with the route transition
 *  120ms   metric grids begin staggering in
 *  180ms   badges, pills, records, and bars spring upward
 *  260ms   numbers count from zero to final values
 *  320ms   text metrics reveal character-by-character
 *  forever glints, bar shimmers, card float, and hover lifts stay alive
 * ───────────────────────────────────────────────────────── */

const SLIDE_IDS = [
	"hero",
	"card",
	"records",
	"style",
	"club",
	"finale",
] as const;

type SlideId = (typeof SLIDE_IDS)[number];
type MetricNumberFormatter = (value: number) => string;

const MOTION_EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MOTION_EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const METRIC_SPRING = {
	damping: 20,
	mass: 0.9,
	stiffness: 220,
	type: "spring" as const,
};
const METRIC_REVEAL_START_DELAY = 0.12;
const METRIC_GRID_STAGGER = 0.075;
const METRIC_TEXT_STAGGER = 0.016;

const METRIC_GRID_VARIANTS = {
	hidden: { opacity: 1 },
	visible: {
		opacity: 1,
		transition: {
			delayChildren: stagger(METRIC_GRID_STAGGER, {
				startDelay: METRIC_REVEAL_START_DELAY,
			}),
		},
	},
};

function getMetricItemVariants(shouldReduceMotion: boolean) {
	return shouldReduceMotion
		? {
				hidden: { opacity: 0 },
				visible: {
					opacity: 1,
					transition: { duration: 0.18 },
				},
			}
		: {
				hidden: {
					filter: "blur(10px)",
					opacity: 0,
					scale: 0.94,
					y: 24,
				},
				visible: {
					filter: "blur(0px)",
					opacity: 1,
					scale: 1,
					y: 0,
					transition: METRIC_SPRING,
				},
			};
}

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

function buildRankLabel(
	rank: number | null,
	workspaceSize: number,
	fallback: string,
) {
	if (!rank || workspaceSize <= 0) {
		return fallback;
	}

	return `#${rank} / ${workspaceSize}`;
}

function formatCompactInteger(value: number) {
	return formatCompactNumber(Math.round(value));
}

function formatRawInteger(value: number) {
	return String(Math.round(value));
}

function formatCompactTokenCounter(value: number) {
	return formatCompactTokenLabel(Math.round(value));
}

function formatWholeCurrencyCounter(value: number) {
	return formatWholeCurrency(Math.round(value));
}

function formatCurrencyCounter(value: number) {
	return formatCurrency(Math.max(0, value));
}

function formatPercentCounter(value: number) {
	return formatPercent(Math.max(0, value));
}

function formatDurationCounter(value: number) {
	return formatDurationLabel(Math.max(0, value));
}

function formatDaysCounter(value: number) {
	return `${Math.round(Math.max(0, value))} days`;
}

function formatHoursCounter(value: number) {
	return formatCompactNumber(Math.max(0, value) / 60);
}

function AnimatedMetricNumber({
	className,
	formatter,
	value,
}: {
	className?: string;
	formatter: MetricNumberFormatter;
	value: number;
}) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const metricValue = useMotionValue(shouldReduceMotion ? value : 0);
	const displayValue = useTransform(metricValue, (latest) => formatter(latest));

	React.useEffect(() => {
		if (shouldReduceMotion) {
			metricValue.jump(value);
			return;
		}

		metricValue.jump(0);
		const controls = animate(metricValue, value, {
			duration: 1.2,
			ease: MOTION_EASE_OUT,
		});

		return () => controls.stop();
	}, [metricValue, shouldReduceMotion, value]);

	return <motion.span className={className}>{displayValue}</motion.span>;
}

function AnimatedMetricText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const animatedCharacters = React.useMemo(() => {
		const characterCounts = new Map<string, number>();

		return Array.from(text, (character) => {
			const nextCount = (characterCounts.get(character) ?? 0) + 1;
			characterCounts.set(character, nextCount);

			return {
				character,
				key: `${character}-${nextCount}`,
			};
		});
	}, [text]);

	if (shouldReduceMotion) {
		return <span className={className}>{text}</span>;
	}

	return (
		<span className={`fifa-wrapped-split-text ${className ?? ""}`}>
			{animatedCharacters.map(({ character, key }, index) => (
				<motion.span
					key={key}
					className="fifa-wrapped-split-text__char"
					initial={{
						filter: "blur(8px)",
						opacity: 0,
						y: 16,
					}}
					animate={{
						filter: "blur(0px)",
						opacity: 1,
						y: 0,
					}}
					transition={{
						delay: METRIC_REVEAL_START_DELAY + index * METRIC_TEXT_STAGGER,
						duration: 0.44,
						ease: MOTION_EASE_OUT,
					}}
				>
					{character === " " ? "\u00A0" : character}
				</motion.span>
			))}
		</span>
	);
}

function AnimatedMetricPanel({
	children,
	className,
	highlight = false,
}: {
	children: React.ReactNode;
	className: string;
	highlight?: boolean;
}) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const itemVariants = React.useMemo(
		() => getMetricItemVariants(shouldReduceMotion),
		[shouldReduceMotion],
	);

	return (
		<motion.div
			className={className}
			variants={itemVariants}
			whileHover={
				shouldReduceMotion
					? undefined
					: {
							rotateX: highlight ? -4 : -2,
							rotateY: highlight ? 3 : 1.5,
							scale: highlight ? 1.026 : 1.018,
							y: highlight ? -10 : -6,
						}
			}
			whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
			transition={METRIC_SPRING}
		>
			<span className="fifa-wrapped-metric-glint" />
			<span className="fifa-wrapped-metric-glint is-secondary" />
			{children}
		</motion.div>
	);
}

function StatPill({
	icon,
	label,
	textValue,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	textValue?: string;
	value?: {
		formatter: MetricNumberFormatter;
		number: number;
	};
}) {
	const renderedValue =
		value !== undefined ? (
			<AnimatedMetricNumber
				className="fifa-wrapped-pill__value"
				formatter={value.formatter}
				value={value.number}
			/>
		) : (
			<AnimatedMetricText
				className="fifa-wrapped-pill__value"
				text={textValue ?? ""}
			/>
		);

	return (
		<AnimatedMetricPanel className="fifa-wrapped-pill">
			<div className="fifa-wrapped-pill__icon">{icon}</div>
			<div>
				<div className="fifa-wrapped-pill__label">{label}</div>
				{renderedValue}
			</div>
		</AnimatedMetricPanel>
	);
}

function RecordTile({
	label,
	context,
	textValue,
	tone = "default",
	value,
}: {
	context: string;
	label: string;
	textValue?: string;
	tone?: "default" | "highlight";
	value?: {
		formatter: MetricNumberFormatter;
		number: number;
	};
}) {
	const renderedValue =
		value !== undefined ? (
			<AnimatedMetricNumber
				className="fifa-wrapped-record__value"
				formatter={value.formatter}
				value={value.number}
			/>
		) : (
			<AnimatedMetricText
				className="fifa-wrapped-record__value"
				text={textValue ?? ""}
			/>
		);

	return (
		<AnimatedMetricPanel
			className={`fifa-wrapped-record ${tone === "highlight" ? "is-highlight" : ""}`}
			highlight={tone === "highlight"}
		>
			<div className="fifa-wrapped-record__label">{label}</div>
			{renderedValue}
			<motion.div
				className="fifa-wrapped-record__context"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					delay: METRIC_REVEAL_START_DELAY + 0.18,
					duration: 0.4,
					ease: MOTION_EASE_OUT,
				}}
			>
				{context}
			</motion.div>
		</AnimatedMetricPanel>
	);
}

function AttributeRow({
	label,
	textValue,
	value,
}: {
	label: string;
	textValue?: string;
	value?: {
		formatter: MetricNumberFormatter;
		number: number;
	};
}) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const itemVariants = React.useMemo(
		() => getMetricItemVariants(shouldReduceMotion),
		[shouldReduceMotion],
	);

	return (
		<motion.div
			className="fifa-wrapped-attribute"
			variants={itemVariants}
			whileHover={
				shouldReduceMotion
					? undefined
					: {
							scale: 1.05,
							x: 2,
						}
			}
			transition={METRIC_SPRING}
		>
			{value !== undefined ? (
				<AnimatedMetricNumber
					className="fifa-wrapped-attribute__rating"
					formatter={value.formatter}
					value={value.number}
				/>
			) : (
				<AnimatedMetricText
					className="fifa-wrapped-attribute__rating"
					text={textValue ?? ""}
				/>
			)}
			<div className="fifa-wrapped-attribute__name">{label}</div>
		</motion.div>
	);
}

function MeterRow({
	className,
	icon,
	label,
	value,
}: {
	className?: string;
	icon: React.ReactNode;
	label: string;
	value: number;
}) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const itemVariants = React.useMemo(
		() => getMetricItemVariants(shouldReduceMotion),
		[shouldReduceMotion],
	);

	return (
		<motion.div
			className={`fifa-wrapped-meter ${className ?? ""}`}
			variants={itemVariants}
			whileHover={
				shouldReduceMotion
					? undefined
					: {
							scale: 1.016,
							x: 3,
						}
			}
			transition={METRIC_SPRING}
		>
			<span className="fifa-wrapped-metric-glint" />
			<span className="fifa-wrapped-metric-glint is-secondary" />
			<div className="fifa-wrapped-meter__label">
				{icon}
				<span>{label}</span>
			</div>
			<div className="fifa-wrapped-meter__track">
				<motion.div
					className={`fifa-wrapped-meter__fill ${className ?? ""}`.trim()}
					initial={{ scaleX: 0 }}
					animate={{
						scaleX: Math.max(0.06, Math.min(1, value / 100)),
					}}
					style={{ originX: 0 }}
					transition={{
						delay: METRIC_REVEAL_START_DELAY + 0.1,
						duration: shouldReduceMotion ? 0.2 : 0.75,
						ease: MOTION_EASE_IN_OUT,
					}}
				/>
			</div>
			<AnimatedMetricNumber
				className="fifa-wrapped-meter__value"
				formatter={formatPercentCounter}
				value={value}
			/>
		</motion.div>
	);
}

function MetricChip({ children }: { children: React.ReactNode }) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const itemVariants = React.useMemo(
		() => getMetricItemVariants(shouldReduceMotion),
		[shouldReduceMotion],
	);

	return (
		<motion.span
			className="fifa-wrapped-chip"
			variants={itemVariants}
			whileHover={
				shouldReduceMotion
					? undefined
					: {
							scale: 1.03,
							y: -4,
						}
			}
			transition={METRIC_SPRING}
		>
			<span className="fifa-wrapped-metric-glint" />
			<span className="fifa-wrapped-metric-glint is-secondary" />
			<span className="fifa-wrapped-chip__content">{children}</span>
		</motion.span>
	);
}

function HeroSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--hero">
			<motion.div
				className="fifa-wrapped-hero-copy"
				initial={{ opacity: 0, y: 24 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.52, ease: MOTION_EASE_OUT }}
			>
				<motion.div
					className="fifa-wrapped-kicker"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						delay: 0.08,
						duration: 0.36,
						ease: MOTION_EASE_OUT,
					}}
				>
					Rudel Ultimate Team
				</motion.div>
				<h1 className="fifa-wrapped-hero-title">
					<span>{story.firstName},</span>
					<span>your AI season is ready.</span>
				</h1>
				<motion.p
					className="fifa-wrapped-hero-summary"
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						delay: 0.14,
						duration: 0.42,
						ease: MOTION_EASE_OUT,
					}}
				>
					A Spotify-style walkout built from your actual analytics, with a FIFA
					card spine and zero WebGL baggage.
				</motion.p>
				<motion.div
					className="fifa-wrapped-hero-badges"
					initial="hidden"
					animate="visible"
					variants={METRIC_GRID_VARIANTS}
				>
					<MetricChip>
						<span>OVR </span>
						<AnimatedMetricNumber
							formatter={formatRawInteger}
							value={story.overallRating}
						/>
					</MetricChip>
					<MetricChip>
						<AnimatedMetricText text={story.seasonRole} />
					</MetricChip>
					<MetricChip>
						<AnimatedMetricText text={story.periodLabel} />
					</MetricChip>
				</motion.div>
			</motion.div>
			<motion.div
				className="fifa-wrapped-hero-scoreboard"
				initial="hidden"
				animate="visible"
				variants={METRIC_GRID_VARIANTS}
			>
				<StatPill
					icon={<Trophy className="size-4" />}
					label="Token rank"
					textValue={buildRankLabel(
						story.ranks.tokenRank,
						story.workspaceSize,
						"Unranked",
					)}
				/>
				<StatPill
					icon={<Zap className="size-4" />}
					label="Total tokens"
					value={{
						formatter: formatCompactTokenCounter,
						number: story.totalTokens,
					}}
				/>
				<StatPill
					icon={<Goal className="size-4" />}
					label="Commits logged"
					value={{
						formatter: formatCompactInteger,
						number: story.totalCommits,
					}}
				/>
			</motion.div>
		</div>
	);
}

function CardSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--card">
			<motion.div
				className="fifa-player-card"
				initial={{
					opacity: 0,
					rotateY: -10,
					scale: 0.92,
					x: -28,
				}}
				animate={{
					opacity: 1,
					rotateY: 0,
					scale: 1,
					x: 0,
				}}
				transition={{
					...METRIC_SPRING,
					delay: 0.08,
				}}
				whileHover={{
					rotateY: 4,
					scale: 1.02,
					y: -8,
				}}
			>
				<div className="fifa-player-card__shine" />
				<AnimatedMetricNumber
					className="fifa-player-card__overall"
					formatter={formatRawInteger}
					value={story.overallRating}
				/>
				<motion.div
					className="fifa-player-card__position"
					initial={{ opacity: 0, x: -8 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{
						delay: 0.22,
						duration: 0.3,
						ease: MOTION_EASE_OUT,
					}}
				>
					AI
				</motion.div>
				<motion.div
					className="fifa-player-card__portrait"
					initial={{ opacity: 0, scale: 0.94, y: 16 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					transition={{
						delay: 0.18,
						duration: 0.52,
						ease: MOTION_EASE_OUT,
					}}
				>
					{story.imageUrl ? (
						<img src={story.imageUrl} alt={story.displayName} />
					) : (
						<div className="fifa-player-card__initials">{story.initials}</div>
					)}
				</motion.div>
				<motion.div
					className="fifa-player-card__name"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						delay: 0.3,
						duration: 0.36,
						ease: MOTION_EASE_OUT,
					}}
				>
					{story.displayName}
				</motion.div>
				<motion.div
					className="fifa-player-card__meta"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						delay: 0.38,
						duration: 0.42,
						ease: MOTION_EASE_OUT,
					}}
				>
					<AnimatedMetricText
						className="fifa-player-card__role"
						text={story.seasonRole}
					/>
					<AnimatedMetricText
						className="fifa-player-card__skill"
						text={story.topSkill}
					/>
					<motion.div
						className="fifa-player-card__model"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{
							delay: 0.48,
							duration: 0.34,
							ease: MOTION_EASE_OUT,
						}}
					>
						{story.favoriteModel ? (
							<DashboardModelBadges models={[story.favoriteModel]} />
						) : (
							<span>Model scouting in progress</span>
						)}
					</motion.div>
				</motion.div>
				<motion.div
					className="fifa-player-card__attributes"
					initial="hidden"
					animate="visible"
					variants={METRIC_GRID_VARIANTS}
				>
					<AttributeRow
						label="TOK"
						value={{
							formatter: formatCompactTokenCounter,
							number: story.totalTokens,
						}}
					/>
					<AttributeRow
						label="CST"
						value={{
							formatter: formatWholeCurrencyCounter,
							number: story.totalCost,
						}}
					/>
					<AttributeRow
						label="SES"
						value={{
							formatter: formatCompactInteger,
							number: story.sessionCount,
						}}
					/>
					<AttributeRow
						label="DYS"
						value={{
							formatter: formatCompactInteger,
							number: story.activeDays,
						}}
					/>
					<AttributeRow
						label="CMD"
						value={{
							formatter: formatCompactInteger,
							number: story.totalCommits,
						}}
					/>
					<AttributeRow
						label="WIN"
						value={{
							formatter: formatPercentCounter,
							number: story.successRate,
						}}
					/>
				</motion.div>
			</motion.div>
			<motion.div
				className="fifa-wrapped-side-panel"
				initial={{ opacity: 0, x: 30 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{
					delay: 0.12,
					duration: 0.5,
					ease: MOTION_EASE_OUT,
				}}
			>
				<div className="fifa-wrapped-section-title">Season card</div>
				<h2 className="fifa-wrapped-panel-heading">
					Your base card is built from real output, not vibes.
				</h2>
				<motion.div
					className="fifa-wrapped-panel-grid"
					initial="hidden"
					animate="visible"
					variants={METRIC_GRID_VARIANTS}
				>
					<RecordTile
						label="Total spend"
						context={`${formatTrendLabel(story.successRateTrend)} over the period`}
						value={{
							formatter: formatCurrencyCounter,
							number: story.totalCost,
						}}
					/>
					<RecordTile
						label="Session average"
						context={`${formatCompactNumber(story.sessionCount)} sessions played`}
						value={{
							formatter: formatDurationCounter,
							number: story.avgSessionDurationMin,
						}}
					/>
					<RecordTile
						label="Projects"
						context={`${formatCompactNumber(story.repositoryCount)} repositories touched`}
						value={{
							formatter: formatCompactInteger,
							number: story.distinctProjects,
						}}
					/>
					<RecordTile
						label="Last active"
						context="Most recent tracked matchday"
						textValue={
							story.lastActiveDate
								? formatDateLabel(story.lastActiveDate)
								: "N/A"
						}
					/>
				</motion.div>
			</motion.div>
		</div>
	);
}

function RecordsSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--records">
			<motion.div
				className="fifa-wrapped-section-title"
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.34, ease: MOTION_EASE_OUT }}
			>
				Season records
			</motion.div>
			<motion.h2
				className="fifa-wrapped-panel-heading"
				initial={{ opacity: 0, y: 18 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					delay: 0.08,
					duration: 0.44,
					ease: MOTION_EASE_OUT,
				}}
			>
				The moments that actually defined your year.
			</motion.h2>
			<motion.div
				className="fifa-wrapped-record-grid"
				initial="hidden"
				animate="visible"
				variants={METRIC_GRID_VARIANTS}
			>
				<RecordTile
					label="Longest session"
					context="Single-session endurance"
					tone="highlight"
					value={{
						formatter: formatDurationCounter,
						number: story.longestSessionMin,
					}}
				/>
				<RecordTile
					label="Longest streak"
					context="Consecutive active days"
					value={{
						formatter: formatDaysCounter,
						number: story.longestStreakDays,
					}}
				/>
				<RecordTile
					label="Peak token day"
					context={
						story.peakDayDate
							? `${formatDateLabel(story.peakDayDate)} with ${formatCompactNumber(story.peakDaySessions)} sessions`
							: "No day peak captured"
					}
					value={{
						formatter: formatCompactTokenCounter,
						number: story.peakDayTokens,
					}}
				/>
				<RecordTile
					label="Biggest session"
					context="Highest single-session token volume"
					value={{
						formatter: formatCompactTokenCounter,
						number: story.topSessionTokens,
					}}
				/>
				<RecordTile
					label="Top project"
					context={`${formatCompactTokenLabel(story.topProjectTokens)} tokens across ${formatCompactNumber(story.topProjectSessions)} sessions`}
					textValue={story.topProjectName}
				/>
				<RecordTile
					label="Hours on pitch"
					context="Total logged coding hours"
					value={{
						formatter: formatHoursCounter,
						number: story.totalDurationMin,
					}}
				/>
			</motion.div>
		</div>
	);
}

function StyleSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--style">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.36, ease: MOTION_EASE_OUT }}
			>
				<div className="fifa-wrapped-section-title">Play style</div>
				<h2 className="fifa-wrapped-panel-heading">
					What your toolset says about how you build.
				</h2>
			</motion.div>
			<motion.div
				className="fifa-wrapped-style-grid"
				initial="hidden"
				animate="visible"
				variants={METRIC_GRID_VARIANTS}
			>
				<RecordTile
					label="Top skill"
					context={`${formatCompactNumber(story.distinctSkills)} distinct skills in the bag`}
					tone="highlight"
					textValue={story.topSkill}
				/>
				<RecordTile
					label="Top slash command"
					context={`${formatCompactNumber(story.distinctSlashCommands)} command families used`}
					textValue={story.topSlashCommand}
				/>
				<RecordTile
					label="Top subagent"
					context={`${formatPercent(story.featureAdoptionRates.subagents)} subagent adoption`}
					textValue={story.topSubagent}
				/>
				<RecordTile
					label="Dominant archetype"
					context="Most common session profile"
					textValue={story.dominantArchetype}
				/>
			</motion.div>
			<motion.div
				className="fifa-wrapped-meter-panel"
				initial="hidden"
				animate="visible"
				variants={METRIC_GRID_VARIANTS}
			>
				<MeterRow
					icon={<BrainCircuit className="size-4" />}
					label="Plan mode"
					value={story.planModeRate}
				/>
				<MeterRow
					className="is-gold"
					icon={<Goal className="size-4" />}
					label="Commit rate"
					value={story.commitRate}
				/>
				<MeterRow
					className="is-lime"
					icon={<Command className="size-4" />}
					label="Slash command adoption"
					value={story.featureAdoptionRates.slashCommands}
				/>
			</motion.div>
		</div>
	);
}

function ClubSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<div className="fifa-wrapped-slide fifa-wrapped-slide--club">
			<motion.div
				className="fifa-wrapped-club-panel"
				initial={{ opacity: 0, x: -20 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ duration: 0.46, ease: MOTION_EASE_OUT }}
			>
				<div className="fifa-wrapped-section-title">Club table</div>
				<h2 className="fifa-wrapped-panel-heading">
					How you stack up inside the workspace.
				</h2>
				<motion.div
					className="fifa-wrapped-ranking-grid"
					initial="hidden"
					animate="visible"
					variants={METRIC_GRID_VARIANTS}
				>
					<RecordTile
						label="Token rank"
						context={`${formatCompactTokenLabel(story.totalTokens)} across the season`}
						tone="highlight"
						textValue={buildRankLabel(
							story.ranks.tokenRank,
							story.workspaceSize,
							"N/A",
						)}
					/>
					<RecordTile
						label="Spend rank"
						context={formatCurrency(story.totalCost)}
						textValue={buildRankLabel(
							story.ranks.spendRank,
							story.workspaceSize,
							"N/A",
						)}
					/>
					<RecordTile
						label="Sessions rank"
						textValue={buildRankLabel(
							story.ranks.sessionRank,
							story.workspaceSize,
							"N/A",
						)}
						context={`${formatCompactNumber(story.sessionCount)} sessions`}
					/>
					<RecordTile
						label="Commit rank"
						textValue={buildRankLabel(
							story.ranks.commitRank,
							story.workspaceSize,
							"N/A",
						)}
						context={`${formatCompactNumber(story.totalCommits)} commits`}
					/>
				</motion.div>
			</motion.div>
			<motion.div
				className="fifa-wrapped-club-sidebar"
				initial="hidden"
				animate="visible"
				variants={METRIC_GRID_VARIANTS}
			>
				<StatPill
					icon={<FolderKanban className="size-4" />}
					label="Repositories touched"
					value={{
						formatter: formatCompactInteger,
						number: story.repositoryCount,
					}}
				/>
				<StatPill
					icon={<Sparkles className="size-4" />}
					label="Models rotated"
					value={{
						formatter: formatCompactInteger,
						number: story.modelCount,
					}}
				/>
				<StatPill
					icon={<Shield className="size-4" />}
					label="Success rate"
					value={{
						formatter: formatPercentCounter,
						number: story.successRate,
					}}
				/>
				<StatPill
					icon={<Flame className="size-4" />}
					label="Primary error"
					textValue={story.primaryErrorPattern ? "Tracked" : "Clean sheet"}
				/>
				<AnimatedMetricPanel className="fifa-wrapped-repo-stack">
					<div className="fifa-wrapped-repo-stack__label">
						Featured repositories
					</div>
					{story.repositoriesTouched.slice(0, 3).map((repository, index) => (
						<motion.div
							key={repository}
							className="fifa-wrapped-repo-chip"
							initial={{ opacity: 0, x: -12 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								delay: METRIC_REVEAL_START_DELAY + 0.12 + index * 0.08,
								duration: 0.34,
								ease: MOTION_EASE_OUT,
							}}
							whileHover={{ x: 4 }}
						>
							{repository.split("/").pop() || repository}
						</motion.div>
					))}
				</AnimatedMetricPanel>
			</motion.div>
		</div>
	);
}

function FinaleSlide({ story }: { story: FifaWrappedStoryData }) {
	return (
		<motion.div
			className="fifa-wrapped-slide fifa-wrapped-slide--finale"
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.48, ease: MOTION_EASE_OUT }}
		>
			<motion.div
				className="fifa-wrapped-finale-mark"
				initial={{ rotate: -14, scale: 0.86 }}
				animate={{ rotate: 0, scale: 1 }}
				transition={{
					delay: 0.08,
					duration: 0.52,
					ease: MOTION_EASE_OUT,
				}}
			>
				<Trophy className="size-8" />
			</motion.div>
			<div className="fifa-wrapped-section-title">Final whistle</div>
			<h2 className="fifa-wrapped-panel-heading">
				{story.firstName} closes the year as a {story.seasonRole}.
			</h2>
			<motion.p
				className="fifa-wrapped-finale-copy"
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					delay: 0.12,
					duration: 0.42,
					ease: MOTION_EASE_OUT,
				}}
			>
				<span className="fifa-wrapped-inline-metric">
					<AnimatedMetricNumber
						formatter={formatCompactTokenCounter}
						value={story.totalTokens}
					/>
				</span>{" "}
				tokens,{" "}
				<span className="fifa-wrapped-inline-metric">
					<AnimatedMetricNumber
						formatter={formatCompactInteger}
						value={story.totalCommits}
					/>
				</span>{" "}
				commits,{" "}
				<span className="fifa-wrapped-inline-metric">
					<AnimatedMetricNumber
						formatter={formatRawInteger}
						value={story.longestStreakDays}
					/>
				</span>{" "}
				straight days on the grind, and an{" "}
				<span className="fifa-wrapped-inline-metric">
					OVR{" "}
					<AnimatedMetricNumber
						formatter={formatRawInteger}
						value={story.overallRating}
					/>
				</span>{" "}
				card to prove it.
			</motion.p>
			<motion.div
				className="fifa-wrapped-finale-actions"
				initial="hidden"
				animate="visible"
				variants={METRIC_GRID_VARIANTS}
			>
				<Link className="fifa-wrapped-link-button" to={appRoutes.dashboard()}>
					<House className="size-4" />
					Back to dashboard
				</Link>
				<Link
					className="fifa-wrapped-link-button is-secondary"
					to={appRoutes.team()}
				>
					<Swords className="size-4" />
					Open team page
				</Link>
			</motion.div>
		</motion.div>
	);
}

function LoadingState() {
	return (
		<div className="fifa-wrapped-loading">
			<div className="fifa-wrapped-loading__crest" />
			<div className="fifa-wrapped-loading__title">
				Assembling your season card
			</div>
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
	return new Error(
		"Wrapped data loaded, but the story card could not be assembled.",
	);
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

	if (
		!isError &&
		failingQueries.length === 0 &&
		unresolvedQueries.length === 0 &&
		story
	) {
		return null;
	}

	if (
		!isError &&
		failingQueries.length === 0 &&
		unresolvedQueries.length === 0 &&
		isLoading
	) {
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

function ErrorState({ error, onBack }: { error: unknown; onBack: () => void }) {
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
	const { diagnostics, error, isError, isLoading, story } =
		useFifaWrappedData();
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
			<WrappedTunnelCanvas
				phase={activeSlideIndex}
				slideCount={SLIDE_IDS.length}
			/>
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
			<div className="fifa-wrapped-route__grade" />
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
						<div>
							{activeSlideIndex + 1} / {SLIDE_IDS.length}
						</div>
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
						disabled={
							!isStoryReady || activeSlideIndex === SLIDE_IDS.length - 1
						}
					>
						Next
						<ChevronRight className="size-4" />
					</Button>
				</footer>
			</div>
		</div>
	);
}
