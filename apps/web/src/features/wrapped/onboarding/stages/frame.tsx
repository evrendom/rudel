import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	WrappedStageCopy,
	WrappedStageFrame,
} from "@/features/wrapped/stage-frame";

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
	title: ReactNode;
	titleClassName?: string;
}

export function WrappedOnboardingStageFrame(
	props: WrappedOnboardingStageFrameProps,
) {
	return (
		<WrappedStageFrame
			{...props}
			className={cn("mymind-wrapped-onboarding-stage", props.className)}
			copyClassName="mymind-wrapped-onboarding-stage__copy"
			objectClassName={cn(
				"mymind-wrapped-onboarding-stage__object",
				props.objectClassName,
			)}
			supportClassName={cn(
				"mymind-wrapped-onboarding-stage__support",
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
			eyebrowClassName={props.eyebrowClassName}
			titleClassName={props.titleClassName}
		/>
	);
}
