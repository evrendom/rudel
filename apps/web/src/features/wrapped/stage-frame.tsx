import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WrappedStageFrameProps {
	className?: string;
	copy?: ReactNode;
	copyClassName?: string;
	object?: ReactNode;
	objectClassName?: string;
	support?: ReactNode;
	supportClassName?: string;
}

interface WrappedStageCopyProps {
	className?: string;
	description?: ReactNode;
	descriptionClassName?: string;
	eyebrow?: ReactNode;
	eyebrowClassName?: string;
	title: ReactNode;
	titleAs?: "h1" | "h2";
	titleClassName?: string;
}

export function WrappedStageFrame(props: WrappedStageFrameProps) {
	const {
		className,
		copy,
		copyClassName,
		object,
		objectClassName,
		support,
		supportClassName,
	} = props;
	const hasCopy = copy !== undefined && copy !== null;
	const hasObject = object !== undefined && object !== null;
	const hasSupport = support !== undefined && support !== null;

	return (
		<section
			className={cn(
				"mymind-wrapped-stage",
				hasSupport
					? "mymind-wrapped-stage--with-support"
					: "mymind-wrapped-stage--without-support",
				className,
			)}
		>
			{hasCopy ? (
				<div className={cn("mymind-wrapped-stage__copy", copyClassName)}>
					{copy}
				</div>
			) : null}
			{hasObject ? (
				<div className={cn("mymind-wrapped-stage__object", objectClassName)}>
					{object}
				</div>
			) : null}
			{hasSupport ? (
				<div className={cn("mymind-wrapped-stage__support", supportClassName)}>
					{support}
				</div>
			) : null}
		</section>
	);
}

export function WrappedStageCopy(props: WrappedStageCopyProps) {
	const {
		className,
		description,
		descriptionClassName,
		eyebrow,
		eyebrowClassName,
		title,
		titleAs = "h1",
		titleClassName,
	} = props;
	const TitleTag = titleAs;

	return (
		<div className={cn("mymind-wrapped-stage-copy", className)}>
			{eyebrow ? (
				<p
					className={cn("mymind-wrapped-stage-copy__eyebrow", eyebrowClassName)}
				>
					{eyebrow}
				</p>
			) : null}
			<TitleTag
				className={cn("mymind-wrapped-stage-copy__headline", titleClassName)}
			>
				{title}
			</TitleTag>
			{description ? (
				<div
					className={cn(
						"mymind-wrapped-stage-copy__description",
						descriptionClassName,
					)}
				>
					{description}
				</div>
			) : null}
		</div>
	);
}
