import type { ReactNode } from "react";
import {
	WrappedStageCopy,
	type WrappedStageCopyEntrancePreset,
	WrappedStageFrame,
} from "@/features/wrapped/stage-frame";
import { cn } from "@/lib/utils";

interface WrappedOnboardingStageFrameProps {
	className?: string;
	copy: ReactNode;
	object?: ReactNode;
	objectClassName?: string;
	support?: ReactNode;
	supportClassName?: string;
}

interface WrappedOnboardingStageCopyProps {
	className?: string;
	description?: ReactNode;
	descriptionClassName?: string;
	eyebrow?: ReactNode;
	eyebrowClassName?: string;
	entrancePreset?: WrappedStageCopyEntrancePreset;
	title: ReactNode;
	titleClassName?: string;
}

export function WrappedOnboardingStageFrame(
	props: WrappedOnboardingStageFrameProps,
) {
	return (
		<WrappedStageFrame
			{...props}
			className={cn("rudel-wrapped-onboarding-stage", props.className)}
			copyClassName="rudel-wrapped-onboarding-stage__copy"
			objectClassName={cn(
				"rudel-wrapped-onboarding-stage__object",
				props.objectClassName,
			)}
			supportClassName={cn(
				"rudel-wrapped-onboarding-stage__support",
				props.supportClassName,
			)}
		/>
	);
}

export function WrappedOnboardingStageCopy(
	props: WrappedOnboardingStageCopyProps,
) {
	return (
		<WrappedStageCopy
			{...props}
			titleAs="h1"
			className={props.className}
			descriptionClassName={props.descriptionClassName}
			entrancePreset={props.entrancePreset}
			eyebrowClassName={props.eyebrowClassName}
			titleClassName={props.titleClassName}
		/>
	);
}
