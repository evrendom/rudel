"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowUpRightIcon, Minus, XIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/app/ui/button";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/ui/dialog";
import {
	getDefaultSidebarShellTuningState,
	SIDEBAR_NEWS_ACTIVE_ATTRIBUTE,
	type SidebarShellTuningState,
} from "@/features/shell/config/sidebar-shell-debug";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   sidebar card expands into the portal popup
 *    0ms   close request measures popup and card geometry
 *    0ms   dialog closes immediately, but a fixed clone stays on top
 *  280ms   clone scales and translates back into the sidebar target
 *  180ms   backdrop fades out under the clone during the close pass
 * ───────────────────────────────────────────────────────── */

const CARD_LAYOUT_ID = "sidebar-footer-news-card";
const CLOSE_BUTTON_LAYOUT_ID = "sidebar-footer-news-card-close";

const CARD_SPRING = {
	type: "spring" as const,
	stiffness: 360,
	damping: 34,
	mass: 0.9,
};

const POPUP_TRANSITION = {
	duration: 0.22,
	ease: [0.22, 1, 0.36, 1] as const,
};

const BACKDROP_TRANSITION = {
	duration: 0.18,
	ease: [0.22, 1, 0.36, 1] as const,
};

const CONTENT_TRANSITION = {
	duration: 0.2,
	delay: 0.1,
	ease: [0.22, 1, 0.36, 1] as const,
};

const NEWS_DATE = "Apr 6";

const NEWS_PARAGRAPHS = [
	"The shell has been redesigned with tighter spacing, calmer hover states, and more consistent motion across the sidebar.",
	"Tooltips now use the stock Base UI Luma treatment, keyboard shortcuts navigate directly, and utility surfaces feel lighter and more deliberate.",
];

const NEWS_SECTIONS = [
	{
		title: "Highlights",
		items: [
			"Refined sidebar spacing and row geometry",
			"Cleaner tooltip styling with integrated shortcuts",
			"Collapsed utility actions now behave like the expanded menus",
		],
	},
	{
		title: "Polish",
		items: [
			"Softer 2% hover fill and subtle press feedback",
			"News card at the footer with modal expansion",
			"Keyboard navigation for Dashboard, Team, and Settings",
		],
	},
] as const;

type BoxSnapshot = {
	top: number;
	left: number;
	width: number;
	height: number;
	borderRadius: number;
};

type CloseAnimationState = {
	from: BoxSnapshot;
	to: BoxSnapshot;
};

function measureBoxSnapshot(element: HTMLElement): BoxSnapshot {
	const rect = element.getBoundingClientRect();
	const computedStyles = window.getComputedStyle(element);

	return {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height,
		borderRadius:
			Number.parseFloat(computedStyles.borderTopLeftRadius || "0") || 0,
	};
}

function NewsCardInner({ expanded = false }: { expanded?: boolean }) {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-3",
				expanded ? "px-1 pt-1" : undefined,
			)}
		>
			<p className="min-w-0 [font-family:var(--dashboard-01-font-sans)] text-[13px] leading-[16px] font-medium tracking-[-0.03em] text-foreground">
				New shell design is live.
			</p>
			{expanded ? null : (
				<ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
			)}
		</div>
	);
}

function NewsChromeCloseButton({
	onClick,
	label,
	layoutId,
	className,
	iconClassName,
	style,
	animate,
	icon = "close",
}: {
	onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
	label: string;
	layoutId?: string;
	className?: string;
	iconClassName?: string;
	style?: React.CSSProperties;
	animate?: { opacity: number };
	icon?: "close" | "minimize";
}) {
	return (
		<motion.button
			type="button"
			layoutId={layoutId}
			transition={CARD_SPRING}
			onClick={onClick}
			animate={animate}
			className={cn(
				"inline-flex items-center justify-center rounded-full border border-foreground/15 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
				className,
			)}
			style={style}
			aria-label={label}
		>
			{icon === "minimize" ? (
				<Minus className={cn("size-2.5", iconClassName)} />
			) : (
				<XIcon className={cn("size-2.5", iconClassName)} />
			)}
			<span className="sr-only">{label}</span>
		</motion.button>
	);
}

function NewsDialogBody({
	onRequestClose,
	onAcknowledge,
	semantic = false,
	animate = true,
	useSharedLayout = true,
}: {
	onRequestClose: () => void;
	onAcknowledge?: () => void;
	semantic?: boolean;
	animate?: boolean;
	useSharedLayout?: boolean;
}) {
	const TitleTag = semantic ? DialogTitle : "h2";
	const DescriptionTag = semantic ? DialogDescription : "p";
	const BodyWrapper = animate ? motion.div : "div";
	const titleClassName = semantic
		? undefined
		: "font-heading text-base leading-none font-medium";
	const descriptionClassName = semantic
		? undefined
		: "text-sm text-muted-foreground";

	return (
		<BodyWrapper
			{...(animate
				? {
						initial: { opacity: 0, y: 10 },
						animate: { opacity: 1, y: 0 },
						exit: { opacity: 0, y: 6 },
						transition: CONTENT_TRANSITION,
					}
				: {})}
			className="relative flex min-h-0 flex-1 flex-col overflow-y-auto p-6"
		>
			<NewsChromeCloseButton
				onClick={() => onRequestClose()}
				label="Minimize news"
				layoutId={useSharedLayout ? CLOSE_BUTTON_LAYOUT_ID : undefined}
				className="absolute top-4 right-4 size-8"
				iconClassName="size-4"
				icon="minimize"
			/>
			<DialogHeader className="pr-12">
				<div className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
					<span>{NEWS_DATE}</span>
					<span className="rounded-full border border-border/70 bg-secondary px-2 py-0.5">
						Changelog
					</span>
				</div>
				<TitleTag className={titleClassName}>New shell design</TitleTag>
				<DescriptionTag className={descriptionClassName}>
					The modal now uses the stock Base UI Luma dialog treatment for the
					header, body, footer, and close affordance.
				</DescriptionTag>
			</DialogHeader>
			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
				<div className="rounded-3xl border border-border/70 bg-muted/30 p-4">
					<p className="text-sm font-medium text-foreground">What changed</p>
					<div className="mt-3 flex flex-col gap-3">
						{NEWS_PARAGRAPHS.map((paragraph) => (
							<p
								key={paragraph}
								className="text-sm leading-6 text-muted-foreground"
							>
								{paragraph}
							</p>
						))}
					</div>
				</div>
				{NEWS_SECTIONS.map((section) => (
					<div
						key={section.title}
						className="rounded-3xl border border-border/70 bg-background p-4"
					>
						<p className="text-sm font-medium text-foreground">
							{section.title}
						</p>
						<ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
							{section.items.map((item) => (
								<li key={item} className="flex items-start gap-2">
									<span className="mt-1 size-1.5 rounded-full bg-foreground/20" />
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
			<DialogFooter className="mt-6">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={onRequestClose}
				>
					Minimize
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onAcknowledge ?? onRequestClose}
				>
					Got it
				</Button>
			</DialogFooter>
		</BodyWrapper>
	);
}

function NewsCloseAnimationOverlay({
	closeAnimation,
	newsDebugTuning,
	onComplete,
}: {
	closeAnimation: CloseAnimationState;
	newsDebugTuning: SidebarShellTuningState;
	onComplete: () => void;
}) {
	const scaleX = closeAnimation.to.width / closeAnimation.from.width;
	const scaleY = closeAnimation.to.height / closeAnimation.from.height;
	const promotedModalStyle = newsDebugTuning.newsPromoteModalCompositorLayer
		? {
				willChange: "transform, opacity",
				contain: "paint",
				isolation: "isolate" as const,
				backfaceVisibility: "hidden" as const,
			}
		: undefined;

	return createPortal(
		<>
			<motion.div
				initial={{ opacity: 1 }}
				animate={{ opacity: 0 }}
				transition={BACKDROP_TRANSITION}
				className="fixed inset-0 bg-black/30 supports-backdrop-filter:backdrop-blur-sm"
				style={{ zIndex: newsDebugTuning.newsBackdropZ }}
			/>
			<motion.div
				initial={false}
				animate={{
					x: closeAnimation.to.left - closeAnimation.from.left,
					y: closeAnimation.to.top - closeAnimation.from.top,
					scaleX,
					scaleY,
					borderRadius: closeAnimation.to.borderRadius,
				}}
				transition={CARD_SPRING}
				onAnimationComplete={onComplete}
				className="pointer-events-none fixed left-0 top-0 flex flex-col overflow-hidden bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10"
				style={{
					top: closeAnimation.from.top,
					left: closeAnimation.from.left,
					width: closeAnimation.from.width,
					height: closeAnimation.from.height,
					zIndex: newsDebugTuning.newsPopupZ,
					borderRadius: closeAnimation.from.borderRadius,
					transformOrigin: "top left",
					...promotedModalStyle,
				}}
				aria-hidden="true"
			>
				<NewsDialogBody
					animate={false}
					onRequestClose={() => {}}
					onAcknowledge={() => {}}
					useSharedLayout={false}
				/>
			</motion.div>
		</>,
		document.body,
	);
}

export function SidebarNewsCard({ onDismiss }: { onDismiss?: () => void }) {
	const [open, setOpen] = React.useState(false);
	const [isMorphing, setIsMorphing] = React.useState(false);
	const [isAcknowledging, setIsAcknowledging] = React.useState(false);
	const [closeAnimation, setCloseAnimation] =
		React.useState<CloseAnimationState | null>(null);
	const triggerRef = React.useRef<HTMLButtonElement | null>(null);
	const popupRef = React.useRef<HTMLDivElement | null>(null);
	const newsDebugTuning = React.useMemo(getDefaultSidebarShellTuningState, []);
	const useSharedLayout = newsDebugTuning.newsUseSharedLayout;
	const useMeasuredClose = newsDebugTuning.newsUseMeasuredClose;
	const usePlainFixedPopup = newsDebugTuning.newsUsePlainFixedPopup;
	const isCloseAnimating = closeAnimation != null;
	const isTriggerHidden = open || isCloseAnimating;
	const promotedModalStyle = newsDebugTuning.newsPromoteModalCompositorLayer
		? {
				willChange: "transform, opacity",
				contain: "paint",
				isolation: "isolate" as const,
				backfaceVisibility: "hidden" as const,
			}
		: undefined;

	const startCloseAnimation = React.useCallback(() => {
		if (isCloseAnimating) {
			return;
		}

		if (!useMeasuredClose) {
			setIsMorphing(false);
			setOpen(false);
			return;
		}

		const trigger = triggerRef.current;
		const popup = popupRef.current;

		if (!trigger || !popup) {
			setOpen(false);
			return;
		}

		setCloseAnimation({
			from: measureBoxSnapshot(popup),
			to: measureBoxSnapshot(trigger),
		});
		setIsMorphing(false);
		setOpen(false);
	}, [isCloseAnimating, useMeasuredClose]);

	const acknowledgeNews = React.useCallback(() => {
		setCloseAnimation(null);
		setIsMorphing(false);
		setIsAcknowledging(true);
		setOpen(false);
	}, []);

	const handleOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				setCloseAnimation(null);
				setIsAcknowledging(false);
				setOpen(true);
				return;
			}

			if (open) {
				startCloseAnimation();
			}
		},
		[open, startCloseAnimation],
	);

	React.useEffect(() => {
		const trigger = triggerRef.current;
		if (!trigger) {
			return;
		}

		const sidebarContainer = trigger.closest(".dashboard-01-chrome-sidebar");
		const previewContainer = trigger.closest(".dashboard-01-preview");
		if (!(sidebarContainer instanceof HTMLElement)) {
			return;
		}

		const isActive = open || isMorphing || isCloseAnimating;
		if (isActive) {
			sidebarContainer.setAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE, "true");
			if (previewContainer instanceof HTMLElement) {
				previewContainer.setAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE, "true");
			}
		} else {
			sidebarContainer.removeAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE);
			if (previewContainer instanceof HTMLElement) {
				previewContainer.removeAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE);
			}
		}

		return () => {
			sidebarContainer.removeAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE);
			if (previewContainer instanceof HTMLElement) {
				previewContainer.removeAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE);
			}
		};
	}, [isCloseAnimating, isMorphing, open]);

	const popupMotionProps =
		useSharedLayout && !isAcknowledging
			? {
					layoutId: CARD_LAYOUT_ID,
					transition: CARD_SPRING,
					onLayoutAnimationStart: () => setIsMorphing(true),
					onLayoutAnimationComplete: () => setIsMorphing(false),
				}
			: {
					initial: { opacity: 0, y: 12, scale: 0.965 },
					animate: { opacity: 1, y: 0, scale: 1 },
					exit: { opacity: 0, y: 8, scale: 0.985 },
					transition: POPUP_TRANSITION,
				};

	return (
		<>
			<DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
				<LayoutGroup id="sidebar-footer-news-dialog">
					<div className="relative pt-3">
						<DialogPrimitive.Trigger
							render={
								<motion.button
									ref={triggerRef}
									layoutId={
										useSharedLayout && !isCloseAnimating
											? CARD_LAYOUT_ID
											: undefined
									}
									type="button"
									transition={CARD_SPRING}
									animate={{ opacity: isTriggerHidden ? 0 : 1 }}
									onLayoutAnimationStart={() => setIsMorphing(true)}
									onLayoutAnimationComplete={() => setIsMorphing(false)}
									data-sidebar-interactive
									className="relative w-full rounded-xl bg-card px-4 py-4 text-left text-card-foreground shadow-none ring-1 ring-foreground/5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:ring-foreground/10"
									style={{
										zIndex: newsDebugTuning.newsCardTriggerZ,
										pointerEvents: isTriggerHidden ? "none" : undefined,
									}}
									aria-label="Open news"
								/>
							}
						>
							<NewsCardInner />
						</DialogPrimitive.Trigger>
						{onDismiss ? (
							<NewsChromeCloseButton
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									onDismiss();
								}}
								label="Dismiss sidebar news"
								layoutId={
									useSharedLayout && !isCloseAnimating
										? CLOSE_BUTTON_LAYOUT_ID
										: undefined
								}
								className="absolute right-1 top-0 z-10 size-5"
								iconClassName="size-2.5"
								icon="close"
								animate={{ opacity: isTriggerHidden ? 0 : 1 }}
								style={{
									pointerEvents: isTriggerHidden ? "none" : undefined,
									zIndex: newsDebugTuning.newsCardTriggerZ + 1,
								}}
							/>
						) : null}
					</div>
					<AnimatePresence
						onExitComplete={() => {
							if (!isAcknowledging) {
								return;
							}

							setIsAcknowledging(false);
							onDismiss?.();
						}}
					>
						{open ? (
							<DialogPrimitive.Portal keepMounted>
								<DialogPrimitive.Backdrop
									render={
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={BACKDROP_TRANSITION}
											className="fixed inset-0 bg-black/30 supports-backdrop-filter:backdrop-blur-sm"
											style={{ zIndex: newsDebugTuning.newsBackdropZ }}
										/>
									}
								/>
								{usePlainFixedPopup ? (
									<motion.div
										ref={popupRef}
										{...popupMotionProps}
										role="dialog"
										aria-modal="true"
										className="fixed left-1/2 top-3 flex h-[calc(100vh-24px)] w-[min(586px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-4xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10"
										style={{
											zIndex: newsDebugTuning.newsPopupZ,
											...promotedModalStyle,
										}}
									>
										<NewsDialogBody
											animate
											onRequestClose={startCloseAnimation}
											onAcknowledge={onDismiss ? acknowledgeNews : undefined}
											useSharedLayout={useSharedLayout}
										/>
									</motion.div>
								) : (
									<DialogPrimitive.Popup
										initialFocus={false}
										render={
											<motion.div
												ref={popupRef}
												{...popupMotionProps}
												className="fixed left-1/2 top-3 flex h-[calc(100vh-24px)] w-[min(586px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-4xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10"
												style={{
													zIndex: newsDebugTuning.newsPopupZ,
													...promotedModalStyle,
												}}
											/>
										}
									>
										<NewsDialogBody
											animate
											semantic
											onRequestClose={startCloseAnimation}
											onAcknowledge={onDismiss ? acknowledgeNews : undefined}
											useSharedLayout={useSharedLayout}
										/>
									</DialogPrimitive.Popup>
								)}
							</DialogPrimitive.Portal>
						) : null}
					</AnimatePresence>
				</LayoutGroup>
			</DialogPrimitive.Root>
			{closeAnimation ? (
				<NewsCloseAnimationOverlay
					closeAnimation={closeAnimation}
					newsDebugTuning={newsDebugTuning}
					onComplete={() => setCloseAnimation(null)}
				/>
			) : null}
		</>
	);
}
