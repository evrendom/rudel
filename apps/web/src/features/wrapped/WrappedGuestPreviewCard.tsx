import { useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type ReactNode,
	type Ref,
	// biome-ignore lint/style/noRestrictedImports: auto-select focuses the editable name input after React commits it.
	useEffect,
	useRef,
	useState,
} from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { cn } from "@/lib/utils";
import { buildWrappedTeamCardBackMetrics } from "./team-card/back-metrics";
import { WrappedTeamMemberCard } from "./team-card/card";
import { WrappedTeamMemberCardBack } from "./team-card/card-back";
import { WrappedPrintedCardFlip } from "./team-card/printed-card-flip";
import { useWrappedCardTilt } from "./team-card/tilt/use-card-tilt";
import {
	buildRickPlaceholderGuestCardRow,
	RICK_PLACEHOLDER_GUEST_CARD_PRESET,
	UNKNOWN_GUEST_CARD_PRESET,
} from "./wrapped-guest-card-presets";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

interface WrappedGuestPreviewCardProps {
	appearance?: "default" | "unknown";
	appearanceOverlay?: "default" | "unknown" | null;
	disablePerspective?: boolean;
	editableDisplayName?: {
		autoSelect?: boolean;
		onChange: (value: string) => void;
		onSave?: () => void;
		placeholder?: string;
		value: string;
	};
	cardStageRef?: Ref<HTMLDivElement>;
	enableAppearanceOverlay?: boolean;
	mediaOverlayContent?: ReactNode;
	profile: WrappedGuestPreviewProfile | null;
	size?: "hero" | "compact" | "profile";
}

export function WrappedGuestPreviewCard(props: WrappedGuestPreviewCardProps) {
	const {
		appearance = "default",
		appearanceOverlay,
		cardStageRef,
		disablePerspective = false,
		editableDisplayName,
		enableAppearanceOverlay = false,
		mediaOverlayContent,
		profile,
		size = "hero",
	} = props;
	const isUnknownCard = appearance === "unknown";
	const activePreset = isUnknownCard
		? UNKNOWN_GUEST_CARD_PRESET
		: RICK_PLACEHOLDER_GUEST_CARD_PRESET;
	const resolvedAppearanceOverlay =
		enableAppearanceOverlay && appearanceOverlay !== null
			? (appearanceOverlay ?? (isUnknownCard ? "default" : null))
			: null;
	const appearanceOverlayClassName = resolvedAppearanceOverlay
		? "mymind-wrapped-auth-card-preview__appearance-overlay"
		: undefined;
	const backAppearanceOverlayClassName =
		isUnknownCard && resolvedAppearanceOverlay === "default"
			? undefined
			: appearanceOverlayClassName;
	const hasInteractiveFrontControls = Boolean(
		editableDisplayName || mediaOverlayContent,
	);
	const shouldRenderStaticFront = disablePerspective;
	const row = buildRickPlaceholderGuestCardRow(
		profile,
		editableDisplayName?.value,
	);
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const tiltController = useWrappedCardTilt();
	const flipAnimationTimeoutRef = useRef<number | null>(null);
	const nameInputRef = useRef<HTMLInputElement | null>(null);
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(true);
	const backMetrics = buildWrappedTeamCardBackMetrics({
		onboardingMetrics: activePreset.onboardingMetrics,
		row,
		shareCardCreatedAtLabel: activePreset.backIssuedAtLabel,
	});
	const visibleBackMetrics = isUnknownCard
		? backMetrics.map((metric) => ({ ...metric, value: "???" }))
		: backMetrics;
	const canSaveEditableName = Boolean(editableDisplayName?.value.trim());
	const nameContent = editableDisplayName ? (
		<span className="mymind-wrapped-card-profile-step__name-editor">
			<input
				ref={nameInputRef}
				aria-label="Name on card"
				autoComplete="name"
				className="mymind-wrapped-card-profile-step__name-input"
				placeholder={editableDisplayName.placeholder ?? "Your name"}
				value={editableDisplayName.value}
				onClick={(event) => event.stopPropagation()}
				onChange={(event) =>
					editableDisplayName.onChange(event.currentTarget.value)
				}
				onKeyDown={(event) => {
					event.stopPropagation();

					if (event.key !== "Enter") {
						return;
					}

					event.preventDefault();
					saveEditableName();
				}}
				onPointerDown={(event) => event.stopPropagation()}
			/>
			{editableDisplayName.onSave ? (
				<button
					type="button"
					aria-label="Save name"
					className="mymind-wrapped-card-profile-step__name-save"
					disabled={!canSaveEditableName}
					onClick={(event) => {
						event.stopPropagation();
						saveEditableName();
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					Save
				</button>
			) : null}
		</span>
	) : null;
	const printedCardCaptureKey = [
		row.userId,
		row.displayName,
		row.imageUrl ?? "",
		activePreset.theme,
		activePreset.shellClassName,
		activePreset.headerLeftMetric.value,
		activePreset.headerRightMetric.value,
		editableDisplayName?.value ?? "",
		...activePreset.statItems.map((item) => `${item.key}:${item.value}`),
		...visibleBackMetrics.map((metric) => `${metric.label}:${metric.value}`),
	].join("|");

	useMountEffect(() => () => {
		clearFlipAnimationTimeout();
	});

	useEffect(() => {
		if (!editableDisplayName?.autoSelect) {
			return;
		}

		const frameId = window.requestAnimationFrame(() => {
			const input = nameInputRef.current;
			input?.focus();
			input?.select();
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [editableDisplayName?.autoSelect]);

	function handleCardFlipToggle() {
		tiltController.handlePointerLeave();
		clearFlipAnimationTimeout();

		if (reduceMotion) {
			setIsCardFlipAnimating(false);
			setIsCardFrontVisible((currentValue) => !currentValue);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible((currentValue) => !currentValue);
		flipAnimationTimeoutRef.current = window.setTimeout(() => {
			setIsCardFlipAnimating(false);
			flipAnimationTimeoutRef.current = null;
		}, activePreset.flipDurationMs);
	}

	function clearFlipAnimationTimeout() {
		if (flipAnimationTimeoutRef.current === null) {
			return;
		}

		window.clearTimeout(flipAnimationTimeoutRef.current);
		flipAnimationTimeoutRef.current = null;
	}

	function saveEditableName() {
		if (!canSaveEditableName) {
			nameInputRef.current?.focus();
			return;
		}

		editableDisplayName?.onSave?.();
	}

	const frontCardContent = (
		<div className="grid justify-center">
			<WrappedTeamMemberCard
				backgroundOverlayClassName={appearanceOverlayClassName}
				disableOuterShadow
				headerLeftMetric={activePreset.headerLeftMetric}
				headerRightMetric={activePreset.headerRightMetric}
				hideHeaderLogo
				layoutPreset="team-card-preview"
				mediaPanelClassName="mx-auto"
				mediaOverlayContent={mediaOverlayContent}
				nameContent={nameContent}
				row={row}
				shellClassName={activePreset.shellClassName}
				shellStyle={activePreset.shellStyle}
				statItems={activePreset.statItems}
				statTileClassName=""
				theme={activePreset.theme}
			/>
		</div>
	);
	const flipControlContent = (
		<WrappedPrintedCardFlip
			captureKey={printedCardCaptureKey}
			front={frontCardContent}
			back={
				<div className="grid justify-center">
					<WrappedTeamMemberCardBack
						backgroundOverlayClassName={backAppearanceOverlayClassName}
						disableOuterShadow
						metrics={visibleBackMetrics}
						shellClassName={activePreset.shellClassName}
						shellStyle={activePreset.shellStyle}
						theme={activePreset.theme}
					/>
				</div>
			}
			isFrontVisible={isCardFrontVisible}
			reduceMotion={reduceMotion}
		/>
	);

	return (
		<section
			aria-label="Wrapped player card preview"
			className={cn(
				"mymind-wrapped-auth-card-preview team-lineup-surface-scope",
				hasInteractiveFrontControls
					? "mymind-wrapped-auth-card-preview--editable"
					: null,
				enableAppearanceOverlay
					? "mymind-wrapped-auth-card-preview--appearance-overlay"
					: null,
				resolvedAppearanceOverlay === "default" && isUnknownCard
					? "mymind-wrapped-auth-card-preview--unknown-overlay"
					: null,
				resolvedAppearanceOverlay === "default"
					? "mymind-wrapped-auth-card-preview--default-appearance-overlay"
					: null,
				resolvedAppearanceOverlay === "unknown"
					? "mymind-wrapped-auth-card-preview--unknown-appearance-overlay"
					: null,
				isUnknownCard ? "mymind-wrapped-auth-card-preview--unknown" : null,
				shouldRenderStaticFront
					? "mymind-wrapped-auth-card-preview--static"
					: null,
				size === "compact"
					? "mymind-wrapped-auth-card-preview--compact"
					: size === "profile"
						? "mymind-wrapped-auth-card-preview--profile"
						: "mymind-wrapped-auth-card-preview--hero",
			)}
		>
			<div
				ref={cardStageRef}
				className="team-lineup-card-tilt-stage mymind-wrapped-auth-card-preview__tilt-stage"
			>
				<div
					ref={(node) => {
						tiltController.cardTiltRef.current = node;
					}}
					className="team-lineup-card-tilt-shell mymind-wrapped-auth-card-preview__tilt mymind-wrapped-final-stage__tilt-shell"
					data-flip-active={isCardFlipAnimating ? "true" : "false"}
					onPointerMove={(event) => {
						if (shouldRenderStaticFront) {
							return;
						}

						if (!isCardFlipAnimating) {
							tiltController.handlePointerMove(event);
						}
					}}
					onPointerEnter={tiltController.handlePointerEnter}
					onPointerLeave={tiltController.handlePointerLeave}
					onPointerCancel={tiltController.handlePointerLeave}
					style={
						{
							"--wrapped-card-flip-rotate-y": isCardFrontVisible
								? "0deg"
								: "180deg",
						} as CSSProperties
					}
				>
					{shouldRenderStaticFront ? (
						<div className="mymind-wrapped-auth-card-preview__static-front">
							{frontCardContent}
						</div>
					) : hasInteractiveFrontControls ? (
						// biome-ignore lint/a11y/useSemanticElements: The inline card controls cannot be nested inside a button.
						<div
							aria-label={
								isCardFrontVisible
									? "Show back of card"
									: "Reveal front of card"
							}
							aria-pressed={isCardFrontVisible}
							className="mymind-wrapped-final-stage__flip-control"
							data-card-face={isCardFrontVisible ? "front" : "back"}
							role="button"
							tabIndex={0}
							onClick={handleCardFlipToggle}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") {
									return;
								}

								event.preventDefault();
								handleCardFlipToggle();
							}}
						>
							{flipControlContent}
						</div>
					) : (
						<button
							type="button"
							aria-label={
								isCardFrontVisible
									? "Show back of card"
									: "Reveal front of card"
							}
							aria-pressed={isCardFrontVisible}
							className="mymind-wrapped-final-stage__flip-control"
							data-card-face={isCardFrontVisible ? "front" : "back"}
							onClick={handleCardFlipToggle}
						>
							{flipControlContent}
						</button>
					)}
				</div>
			</div>
		</section>
	);
}
