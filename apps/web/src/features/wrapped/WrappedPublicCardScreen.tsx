import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import {
	WRAPPED_SATURDAY_STEPS,
	type WrappedPrimaryStep,
} from "@/features/wrapped/onboarding/config";
import { WrappedOnboardingFooter } from "@/features/wrapped/onboarding/controls";
import {
	getWrappedArchetypeCardBackgroundValue,
	type WrappedArchetypeCardTheme,
} from "@/features/wrapped/team-card/archetypes";
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardStatLayerOpacities,
	WrappedTeamMemberCardTheme,
} from "@/features/wrapped/team-card/card";
import type { WrappedTeamMemberCardBackMetric } from "@/features/wrapped/team-card/card-back";
import { WrappedTeamCardPublicStage } from "@/features/wrapped/team-card/final-stages";
import { useWrappedCardTilt } from "@/features/wrapped/team-card/tilt/use-card-tilt";
import { WrappedProgress } from "@/features/wrapped/WrappedProgress";
import { getWrappedOnboardingProgressView } from "@/features/wrapped/wrapped-onboarding-progress";
import { cn } from "@/lib/utils";

interface WrappedPublicCardScreenProps {
	action: ReactNode;
	activeArchetype: WrappedArchetypeCardTheme;
	backMetrics?: readonly WrappedTeamMemberCardBackMetric[];
	debugControls?: ReactNode;
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities?: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
}

export function WrappedPublicCardScreen(props: WrappedPublicCardScreenProps) {
	const {
		action,
		activeArchetype,
		backMetrics,
		debugControls,
		headerLeftMetric,
		headerRightMetric,
		row,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
	} = props;
	const cardStep = getWrappedPublicCardStep();
	const rewardCardBackground =
		getWrappedArchetypeCardBackgroundValue(activeArchetype) ?? undefined;
	const tiltController = useWrappedCardTilt();

	return (
		<main className="mymind-wrapped-route mymind-wrapped-route--onboarding mymind-wrapped-route--step-card mymind-wrapped-route--public-card">
			<div className="mymind-wrapped-shell mymind-wrapped-shell--reference-top-chrome relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground">
				<div
					className={cn(
						"mymind-wrapped-shell__frame",
						debugControls ? null : "mymind-wrapped-shell__frame--no-footer",
					)}
				>
					<WrappedPublicCardHeader
						activeStep={cardStep}
						rewardCardBackground={rewardCardBackground}
					/>

					<div className="mymind-wrapped-stage-area">
						<div className="mymind-wrapped-stage-slot">
							<div className="flex w-full flex-1">
								<WrappedTeamCardPublicStage
									action={action}
									activeArchetype={activeArchetype}
									backMetrics={backMetrics}
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									row={row}
									shellClassName={shellClassName}
									shellStyle={shellStyle}
									statItems={statItems}
									statLayerOpacities={statLayerOpacities}
									theme={theme}
									tiltController={tiltController}
								/>
							</div>
						</div>
					</div>

					{debugControls ? (
						<WrappedOnboardingFooter
							activePreviewOptions={null}
							activePreviewState="auto"
							activePreviewStepId={null}
							activeStep={cardStep}
							finalFooter={false}
							generalDebugControls={debugControls}
							isContinueVisible
							isDebugControlsVisible
							isStepTransitioning={false}
							onContinue={handlePublicContinue}
							onPreviewStateChange={handlePublicPreviewStateChange}
						/>
					) : null}
				</div>
			</div>
		</main>
	);
}

export function WrappedPublicCardAction(props: {
	children: ReactNode;
	className?: string;
	href: string;
	onClick?: () => void;
}) {
	const { children, className, href, onClick } = props;

	return (
		<a
			className={cn(
				"mymind-wrapped-primary-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
				className,
			)}
			href={href}
			onClick={onClick}
		>
			<span>{children}</span>
			<span className="mymind-wrapped-primary-action__icon">
				<ChevronRight className="size-4" />
			</span>
		</a>
	);
}

function WrappedPublicCardHeader(props: {
	activeStep: WrappedPrimaryStep;
	rewardCardBackground?: string;
}) {
	const { activeStep, rewardCardBackground } = props;
	const progressView = getWrappedOnboardingProgressView(activeStep.id);

	return (
		<header className="mymind-wrapped-top-tray mymind-wrapped-public-card-header">
			<div className="mymind-wrapped-top-tray__row">
				<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--start">
					<span className="mymind-wrapped-top-tray__utility-placeholder" />
				</div>
				<div className="mymind-wrapped-top-tray__center">
					<WrappedProgress
						ariaLabel="Wrapped public card progress"
						disabled
						items={progressView.items.map((item) => ({
							ariaLabel: `Wrapped step ${item.stepNumber}: ${item.label}`,
							id: item.id,
							isActive: item.isActive,
						}))}
						rewardCardBackground={rewardCardBackground}
					/>
				</div>
				<div className="mymind-wrapped-top-tray__slot mymind-wrapped-top-tray__slot--end">
					<span className="mymind-wrapped-top-tray__utility-placeholder" />
				</div>
			</div>
		</header>
	);
}

function getWrappedPublicCardStep() {
	const step = WRAPPED_SATURDAY_STEPS.find(
		(candidate) => candidate.id === "card",
	);

	if (!step) {
		throw new Error("Wrapped public card step is missing.");
	}

	return step;
}

function handlePublicContinue() {}

function handlePublicPreviewStateChange() {}
