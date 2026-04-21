import { BadgeCheck, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { UIEvent } from "react";
import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import {
	resolveUploadStageModel,
	type UploadStageRollItem,
} from "../helpers";

const UPLOAD_REEL_TIMING = {
	advance: 1800,
};

const UPLOAD_REEL = {
	itemHeight: 52,
	activeScale: 1,
	adjacentScale: 0.88,
	farScale: 0.76,
	activeOpacity: 1,
	adjacentOpacity: 0.52,
	farOpacity: 0,
	spring: {
		type: "spring" as const,
		stiffness: 360,
		damping: 30,
	},
};

interface UploadStageProps {
	previewState: string;
}

interface UploadStageReelProps {
	isUploading: boolean;
	items: readonly UploadStageRollItem[];
}

interface UploadStageReelContentProps extends UploadStageReelProps {
	reduceMotion: boolean;
}

export function WrappedOnboardingUploadStage(props: UploadStageProps) {
	const { previewState } = props;
	const model = resolveUploadStageModel(previewState);

	return (
		<section className="mymind-wrapped-upload-stage">
			<div className="mymind-wrapped-upload-card">
				<div className="mymind-wrapped-upload-card__summary">
					<p className="mymind-wrapped-upload-card__body">{model.cardBody}</p>
					{model.cardMeta ? (
						<p className="mymind-wrapped-upload-card__meta">{model.cardMeta}</p>
					) : null}
				</div>

				<UploadStageReel
					isUploading={model.isUploading}
					items={model.rollItems}
				/>

				<div
					className={cn(
						"mymind-wrapped-upload-card__tag",
						model.isUploading ? "is-uploading" : "is-ready",
					)}
				>
					{model.isUploading ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<BadgeCheck className="size-4" />
					)}
					<span>{model.cardEyebrow}</span>
				</div>
			</div>
		</section>
	);
}

function UploadStageReel(props: UploadStageReelProps) {
	const { isUploading, items } = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const reelKey = [
		isUploading ? "uploading" : "ready",
		reduceMotion ? "reduced" : "motion",
		...items.map((item) => `${item.id}:${item.label}:${item.meta}`),
	].join("|");

	return (
		<UploadStageReelContent
			key={reelKey}
			isUploading={isUploading}
			items={items}
			reduceMotion={reduceMotion}
		/>
	);
}

function UploadStageReelContent(props: UploadStageReelContentProps) {
	const { isUploading, items, reduceMotion } = props;
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const initialIndex = getDefaultUploadReelIndex(items.length, isUploading);
	const [activeIndex, setActiveIndex] = useState(initialIndex);

	useMountEffect(() => {
		const frameId = window.requestAnimationFrame(() => {
			scrollUploadReelToIndex({
				index: initialIndex,
				shouldReduceMotion: true,
				viewport: viewportRef.current,
			});
		});

		if (reduceMotion || !isUploading || items.length < 2) {
			return () => {
				window.cancelAnimationFrame(frameId);
			};
		}

		const intervalId = window.setInterval(() => {
			setActiveIndex((previousIndex) => {
				const nextIndex = (previousIndex + 1) % items.length;
				scrollUploadReelToIndex({
					index: nextIndex,
					shouldReduceMotion: reduceMotion,
					viewport: viewportRef.current,
				});
				return nextIndex;
			});
		}, UPLOAD_REEL_TIMING.advance);

		return () => {
			window.cancelAnimationFrame(frameId);
			window.clearInterval(intervalId);
		};
	});

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="mymind-wrapped-upload-reel">
			<div
				ref={viewportRef}
				className="mymind-wrapped-upload-reel__viewport"
				onScroll={(event) => {
					handleUploadReelScroll({
						event,
						itemCount: items.length,
						onIndexChange: setActiveIndex,
					});
				}}
			>
				<div className="mymind-wrapped-upload-reel__list">
					{items.map((item, index) => {
						const relativePosition = getUploadReelRelativePosition({
							activeIndex,
							index,
							total: items.length,
						});
						const motionState = getUploadReelMotionState(relativePosition);

						return (
							<motion.div
								key={item.id}
								animate={motionState}
								className="mymind-wrapped-upload-reel__item"
								data-active={relativePosition === 0 ? "true" : "false"}
								initial={false}
								transition={UPLOAD_REEL.spring}
							>
								<p className="mymind-wrapped-upload-reel__label">
									{item.label}
								</p>
								<p className="mymind-wrapped-upload-reel__meta">{item.meta}</p>
							</motion.div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function handleUploadReelScroll(input: {
	event: UIEvent<HTMLDivElement>;
	itemCount: number;
	onIndexChange: (value: number | ((previousValue: number) => number)) => void;
}) {
	const { event, itemCount, onIndexChange } = input;

	if (itemCount <= 1) {
		return;
	}

	const nextIndex = Math.max(
		0,
		Math.min(
			itemCount - 1,
			Math.round(event.currentTarget.scrollTop / UPLOAD_REEL.itemHeight),
		),
	);

	onIndexChange((previousIndex) =>
		previousIndex === nextIndex ? previousIndex : nextIndex,
	);
}

function scrollUploadReelToIndex(input: {
	index: number;
	shouldReduceMotion: boolean;
	viewport: HTMLDivElement | null;
}) {
	const { index, shouldReduceMotion, viewport } = input;

	if (!viewport) {
		return;
	}

	viewport.scrollTo({
		top: index * UPLOAD_REEL.itemHeight,
		behavior: shouldReduceMotion ? "auto" : "smooth",
	});
}

function getDefaultUploadReelIndex(total: number, isUploading: boolean) {
	if (total <= 1 || isUploading) {
		return 0;
	}

	return total - 1;
}

function getUploadReelRelativePosition(input: {
	activeIndex: number;
	index: number;
	total: number;
}) {
	const { activeIndex, index, total } = input;

	if (total <= 1) {
		return 0;
	}

	const forwardDistance = (index - activeIndex + total) % total;

	if (forwardDistance === 0) {
		return 0;
	}

	if (forwardDistance === 1) {
		return 1;
	}

	if (forwardDistance === total - 1) {
		return -1;
	}

	return forwardDistance < total / 2 ? 2 : -2;
}

function getUploadReelMotionState(relativePosition: number) {
	switch (relativePosition) {
		case 0:
			return {
				opacity: UPLOAD_REEL.activeOpacity,
				scale: UPLOAD_REEL.activeScale,
				zIndex: 3,
			};
		case -1:
			return {
				opacity: UPLOAD_REEL.adjacentOpacity,
				scale: UPLOAD_REEL.adjacentScale,
				zIndex: 2,
			};
		case 1:
			return {
				opacity: UPLOAD_REEL.adjacentOpacity,
				scale: UPLOAD_REEL.adjacentScale,
				zIndex: 2,
			};
		default:
			return {
				opacity: UPLOAD_REEL.farOpacity,
				scale: UPLOAD_REEL.farScale,
				zIndex: 1,
			};
	}
}
