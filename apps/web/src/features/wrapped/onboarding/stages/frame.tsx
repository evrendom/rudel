import type { ReactNode } from "react";
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
	title: ReactNode;
	titleClassName?: string;
}

export function WrappedOnboardingStageFrame(
	props: WrappedOnboardingStageFrameProps,
) {
	const {
		className,
		copy,
		object,
		objectClassName,
		support,
		supportClassName,
	} = props;

	return (
		<section className={cn("mymind-wrapped-onboarding-stage", className)}>
			<div className="mymind-wrapped-onboarding-stage__copy">{copy}</div>
			<div
				className={cn(
					"mymind-wrapped-onboarding-stage__object",
					objectClassName,
				)}
			>
				{object}
			</div>
			<div
				className={cn(
					"mymind-wrapped-onboarding-stage__support",
					supportClassName,
				)}
			>
				{support}
			</div>
		</section>
	);
}

export function WrappedOnboardingStageCopy(
	props: WrappedOnboardingStageCopyProps,
) {
	const {
		className,
		description,
		descriptionClassName,
		eyebrow,
		eyebrowClassName,
		title,
		titleClassName,
	} = props;

	return (
		<div className={cn("mymind-wrapped-onboarding-stage-copy", className)}>
			{eyebrow ? (
				<p
					className={cn(
						"mymind-wrapped-onboarding-stage-copy__eyebrow",
						eyebrowClassName,
					)}
				>
					{eyebrow}
				</p>
			) : null}
			<h2
				className={cn(
					"mymind-wrapped-onboarding-stage-copy__headline",
					titleClassName,
				)}
			>
				{title}
			</h2>
			{description ? (
				<div
					className={cn(
						"mymind-wrapped-onboarding-stage-copy__description",
						descriptionClassName,
					)}
				>
					{description}
				</div>
			) : null}
		</div>
	);
}
