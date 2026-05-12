import type { WrappedShareRevealMetrics } from "@rudel/api-routes";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { WRAPPED_SATURDAY_STEPS } from "@/features/wrapped/onboarding/config";
import { WrappedOnboardingFooter } from "@/features/wrapped/onboarding/controls";
import type { WrappedArchetypeCardTheme } from "@/features/wrapped/team-card/archetypes";
import type {
	WrappedTeamMemberCardEdition,
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardStatLayerOpacities,
	WrappedTeamMemberCardTheme,
} from "@/features/wrapped/team-card/card";
import type { WrappedTeamMemberCardBackMetric } from "@/features/wrapped/team-card/card-back";
import { WrappedTeamCardPublicStage } from "@/features/wrapped/team-card/final-stages";
import { useWrappedCardTilt } from "@/features/wrapped/team-card/tilt/use-card-tilt";
import { cn } from "@/lib/utils";

interface WrappedPublicCardScreenProps {
	action: ReactNode;
	activeArchetype: WrappedArchetypeCardTheme;
	backMetrics?: readonly WrappedTeamMemberCardBackMetric[];
	debugControls?: ReactNode;
	edition?: WrappedTeamMemberCardEdition;
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
	revealMetrics?: WrappedShareRevealMetrics;
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
		edition,
		headerLeftMetric,
		headerRightMetric,
		revealMetrics,
		row,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
	} = props;
	const cardStep = getWrappedPublicCardStep();
	const tiltController = useWrappedCardTilt();

	return (
		<main className="rudel-wrapped-route rudel-wrapped-route--onboarding rudel-wrapped-route--step-card rudel-wrapped-route--public-card">
			<div className="rudel-wrapped-shell rudel-wrapped-shell--aligned-top-chrome relative z-[1] mx-auto flex w-full flex-1 flex-col text-foreground">
				<div
					className={cn(
						"rudel-wrapped-shell__frame",
						debugControls ? null : "rudel-wrapped-shell__frame--no-footer",
					)}
				>
					<WrappedPublicCardTopTraySpacer />

					<div className="rudel-wrapped-stage-area">
						<div className="rudel-wrapped-stage-slot">
							<div className="flex w-full flex-1">
								<WrappedTeamCardPublicStage
									action={action}
									activeArchetype={activeArchetype}
									backMetrics={backMetrics}
									edition={edition}
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									revealMetrics={revealMetrics}
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
				"rudel-wrapped-primary-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold",
				className,
			)}
			href={href}
			onClick={onClick}
		>
			<span>{children}</span>
			<span className="rudel-wrapped-primary-action__icon">
				<ChevronRight className="size-4" />
			</span>
		</a>
	);
}

function WrappedPublicCardTopTraySpacer() {
	return (
		<div
			aria-hidden="true"
			className="rudel-wrapped-top-tray rudel-wrapped-top-tray--empty"
		/>
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
