import {
	type KeyboardEvent,
	type PointerEvent,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	buildSessionDetailActivityGroups,
	type SessionDetailActivityGroup,
	type SessionDetailActivityKind,
} from "./session-detail-activity-groups";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import "./session-detail-activity-strip.css";

const ACTIVITY_CLOSE_DELAY_MS = 150;
const ACTIVITY_CONTENT_DURATION_MS = 180;
const ACTIVITY_SKIP_DELAY_MS = 300;

type SessionDetailActivityMotion =
	| "from-end"
	| "from-start"
	| "to-end"
	| "to-start";

type SessionDetailActivityPanelFrame = {
	group: SessionDetailActivityGroup;
	id: number;
	motion: SessionDetailActivityMotion | undefined;
};

type SessionDetailActivityTriggerFlags = {
	hasPointerMoveOpened: boolean;
	wasClickClose: boolean;
	wasEscapeClose: boolean;
};

function SessionDetailActivityPanel({
	group,
	onClose,
	onJump,
}: {
	group: SessionDetailActivityGroup;
	onClose: () => void;
	onJump: (target: { eventId: string | undefined; turnIndex: number }) => void;
}) {
	return (
		<div className="min-h-0 overflow-hidden rounded-md">
			{group.occurrences.length > 0 ? (
				<ul
					aria-label={`${group.label} occurrences`}
					className="grid max-h-72 grid-cols-2 gap-0.5 overflow-y-auto p-1"
				>
					{group.occurrences.map((occurrence) => (
						<li key={occurrence.key}>
							<button
								className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-4 py-3 text-left hover:bg-black/3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) dark:hover:bg-white/3"
								onClick={() => {
									onJump({
										eventId: occurrence.eventId,
										turnIndex: occurrence.turnIndex,
									});
									window.setTimeout(onClose, 0);
								}}
								type="button"
							>
								<p className="min-w-0 truncate text-[0.8125rem]/5 font-medium tracking-[-0.01em] text-[#3c4149] dark:text-[#d0d6e0]">
									{occurrence.detail}
								</p>
								<p className="truncate text-[0.8125rem]/5 tracking-[-0.01em] text-[#6f6e77] tabular-nums dark:text-[#b4bcd099]">
									{occurrence.turnLabel}
									{occurrence.time ? ` · ${occurrence.time}` : ""}
								</p>
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className="px-4 py-3 text-base text-[#6f6e77] sm:text-[0.8125rem]/5 dark:text-[#b4bcd099]">
					{group.emptyLabel}
				</p>
			)}
		</div>
	);
}

function SessionDetailActivityMenuItem({
	group,
	onKeyDown,
	onPointerEnter,
	onPointerLeave,
	onPointerMove,
	onSelect,
	triggerRef,
	isOpen,
}: {
	group: SessionDetailActivityGroup;
	isOpen: boolean;
	onKeyDown: (
		event: KeyboardEvent<HTMLButtonElement>,
		kind: SessionDetailActivityKind,
	) => void;
	onPointerEnter: (kind: SessionDetailActivityKind) => void;
	onPointerLeave: (
		event: PointerEvent<HTMLButtonElement>,
		kind: SessionDetailActivityKind,
	) => void;
	onPointerMove: (
		event: PointerEvent<HTMLButtonElement>,
		kind: SessionDetailActivityKind,
	) => void;
	onSelect: (kind: SessionDetailActivityKind) => void;
	triggerRef: (element: HTMLButtonElement | null) => void;
}) {
	return (
		<li className="session-detail-opaline-trigger-item">
			<button
				aria-expanded={isOpen}
				aria-haspopup="menu"
				className={cn(
					"session-detail-opaline-trigger relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border-[0.5px] border-black/20 bg-white px-2.5 py-1 text-[0.8125rem]/5 font-medium text-black/60 hover:bg-black/[0.063] hover:text-black/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) dark:border-white/25 dark:bg-(--session-overview-surface) dark:text-white/70 dark:hover:bg-white/[0.071] dark:hover:text-white/95",
					isOpen &&
						"bg-black/[0.063] text-black/90 dark:bg-white/[0.071] dark:text-white/95",
				)}
				data-state={isOpen ? "open" : "closed"}
				onClick={() => onSelect(group.kind)}
				onKeyDown={(event) => onKeyDown(event, group.kind)}
				onPointerEnter={() => onPointerEnter(group.kind)}
				onPointerLeave={(event) => onPointerLeave(event, group.kind)}
				onPointerMove={(event) => onPointerMove(event, group.kind)}
				ref={triggerRef}
				type="button"
			>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
				/>
				<span>{group.label}</span>
				<span className="text-black/60 tabular-nums dark:text-white/70">
					{group.totalCount.toLocaleString()}
				</span>
			</button>
		</li>
	);
}

export function SessionDetailActivityStrip({
	onJump,
	options,
}: {
	onJump: (target: { eventId: string | undefined; turnIndex: number }) => void;
	options: readonly SessionDetailOverviewTurnOption[];
}) {
	const [openKind, setOpenKind] = useState<
		SessionDetailActivityKind | undefined
	>();
	const [panelFrames, setPanelFrames] = useState<
		readonly SessionDetailActivityPanelFrame[]
	>([]);
	const [popupHeight, setPopupHeight] = useState(0);
	const [popupState, setPopupState] = useState<"closed" | "open">("closed");
	const groups = useMemo(
		() => buildSessionDetailActivityGroups({ options }),
		[options],
	);
	const activeKindRef = useRef<SessionDetailActivityKind | undefined>(
		undefined,
	);
	const cleanupTimerRef = useRef<number | undefined>(undefined);
	const closeTimerRef = useRef<number | undefined>(undefined);
	const isOpenDelayedRef = useRef(true);
	const openTimerRef = useRef<number | undefined>(undefined);
	const panelElementsRef = useRef(new Map<number, HTMLDivElement>());
	const skipDelayTimerRef = useRef<number | undefined>(undefined);
	const transitionIdRef = useRef(0);
	const triggerElementsRef = useRef(
		new Map<SessionDetailActivityKind, HTMLButtonElement>(),
	);
	const triggerFlagsRef = useRef(
		new Map<SessionDetailActivityKind, SessionDetailActivityTriggerFlags>(),
	);

	const clearTimer = useCallback((timer: number | undefined) => {
		if (timer !== undefined) {
			window.clearTimeout(timer);
		}
	}, []);

	const updateOpenDelay = useCallback(
		(kind: SessionDetailActivityKind | undefined) => {
			clearTimer(skipDelayTimerRef.current);
			if (kind) {
				isOpenDelayedRef.current = false;
				return;
			}
			skipDelayTimerRef.current = window.setTimeout(() => {
				isOpenDelayedRef.current = true;
			}, ACTIVITY_SKIP_DELAY_MS);
		},
		[clearTimer],
	);

	const openMenu = useCallback(
		(kind: SessionDetailActivityKind) => {
			if (activeKindRef.current === kind) {
				return;
			}
			clearTimer(closeTimerRef.current);
			clearTimer(cleanupTimerRef.current);
			const group = groups.find((candidate) => candidate.kind === kind);
			if (!group) {
				return;
			}

			const previousKind = activeKindRef.current;
			activeKindRef.current = kind;
			setOpenKind(kind);
			setPopupState("open");
			updateOpenDelay(kind);
			const transitionId = ++transitionIdRef.current;

			if (!previousKind) {
				setPanelFrames([{ group, id: transitionId, motion: undefined }]);
				return;
			}

			const previousGroup = groups.find(
				(candidate) => candidate.kind === previousKind,
			);
			if (!previousGroup) {
				setPanelFrames([{ group, id: transitionId, motion: undefined }]);
				return;
			}
			const previousIndex = groups.indexOf(previousGroup);
			const nextIndex = groups.indexOf(group);
			const movingForward = nextIndex > previousIndex;
			setPanelFrames((currentFrames) => {
				const previousFrame = currentFrames.find(
					(frame) => frame.group.kind === previousKind,
				) ?? {
					group: previousGroup,
					id: transitionId - 1,
					motion: undefined,
				};
				return [
					{
						...previousFrame,
						motion: movingForward ? "to-start" : "to-end",
					},
					{
						group,
						id: transitionId,
						motion: movingForward ? "from-end" : "from-start",
					},
				];
			});
			cleanupTimerRef.current = window.setTimeout(() => {
				if (transitionId === transitionIdRef.current) {
					setPanelFrames([{ group, id: transitionId, motion: undefined }]);
				}
			}, ACTIVITY_CONTENT_DURATION_MS);
		},
		[clearTimer, groups, updateOpenDelay],
	);

	const closeMenu = useCallback(() => {
		clearTimer(openTimerRef.current);
		clearTimer(closeTimerRef.current);
		clearTimer(cleanupTimerRef.current);
		if (!activeKindRef.current) {
			return;
		}
		activeKindRef.current = undefined;
		setOpenKind(undefined);
		setPopupState("closed");
		updateOpenDelay(undefined);
		const transitionId = ++transitionIdRef.current;
		cleanupTimerRef.current = window.setTimeout(() => {
			if (
				transitionId === transitionIdRef.current &&
				activeKindRef.current === undefined
			) {
				setPanelFrames([]);
			}
		}, ACTIVITY_CONTENT_DURATION_MS);
	}, [clearTimer, updateOpenDelay]);

	const scheduleClose = useCallback(() => {
		clearTimer(openTimerRef.current);
		clearTimer(closeTimerRef.current);
		closeTimerRef.current = window.setTimeout(
			closeMenu,
			ACTIVITY_CLOSE_DELAY_MS,
		);
	}, [clearTimer, closeMenu]);

	const enterTrigger = useCallback(
		(kind: SessionDetailActivityKind) => {
			clearTimer(openTimerRef.current);
			clearTimer(closeTimerRef.current);
			if (!isOpenDelayedRef.current || activeKindRef.current) {
				openMenu(kind);
				return;
			}
			openTimerRef.current = window.setTimeout(() => openMenu(kind), 0);
		},
		[clearTimer, openMenu],
	);

	const getTriggerFlags = useCallback((kind: SessionDetailActivityKind) => {
		const existing = triggerFlagsRef.current.get(kind);
		if (existing) {
			return existing;
		}
		const next = {
			hasPointerMoveOpened: false,
			wasClickClose: false,
			wasEscapeClose: false,
		};
		triggerFlagsRef.current.set(kind, next);
		return next;
	}, []);

	const handlePointerEnter = useCallback(
		(kind: SessionDetailActivityKind) => {
			clearTimer(closeTimerRef.current);
			const flags = getTriggerFlags(kind);
			flags.wasClickClose = false;
			flags.wasEscapeClose = false;
		},
		[clearTimer, getTriggerFlags],
	);

	const handlePointerMove = useCallback(
		(
			event: PointerEvent<HTMLButtonElement>,
			kind: SessionDetailActivityKind,
		) => {
			const flags = getTriggerFlags(kind);
			if (
				event.pointerType !== "mouse" ||
				flags.hasPointerMoveOpened ||
				flags.wasClickClose ||
				flags.wasEscapeClose
			) {
				return;
			}
			flags.hasPointerMoveOpened = true;
			enterTrigger(kind);
		},
		[enterTrigger, getTriggerFlags],
	);

	const handlePointerLeave = useCallback(
		(
			event: PointerEvent<HTMLButtonElement>,
			kind: SessionDetailActivityKind,
		) => {
			if (event.pointerType !== "mouse") {
				return;
			}
			getTriggerFlags(kind).hasPointerMoveOpened = false;
			scheduleClose();
		},
		[getTriggerFlags, scheduleClose],
	);

	const handleKeyDown = useCallback(
		(
			event: KeyboardEvent<HTMLButtonElement>,
			kind: SessionDetailActivityKind,
		) => {
			if (event.key === "Escape") {
				getTriggerFlags(kind).wasEscapeClose = true;
				closeMenu();
				return;
			}
			if (event.key === "ArrowDown" && activeKindRef.current === kind) {
				event.preventDefault();
				document
					.querySelector<HTMLButtonElement>(
						'.session-detail-opaline-panel[data-active="true"] button',
					)
					?.focus();
				return;
			}
			if (!["ArrowLeft", "ArrowRight", "End", "Home"].includes(event.key)) {
				return;
			}
			event.preventDefault();
			const currentIndex = groups.findIndex((group) => group.kind === kind);
			const nextIndex =
				event.key === "Home"
					? 0
					: event.key === "End"
						? groups.length - 1
						: (currentIndex +
								(event.key === "ArrowRight" ? 1 : -1) +
								groups.length) %
							groups.length;
			const nextKind = groups[nextIndex]?.kind;
			if (nextKind) {
				triggerElementsRef.current.get(nextKind)?.focus();
			}
		},
		[closeMenu, getTriggerFlags, groups],
	);

	useLayoutEffect(() => {
		const activeFrame = panelFrames.find(
			(frame) => frame.group.kind === activeKindRef.current,
		);
		if (!activeFrame) {
			return;
		}
		const panel = panelElementsRef.current.get(activeFrame.id);
		if (!panel) {
			return;
		}
		const nextHeight = Math.ceil(panel.getBoundingClientRect().height) + 16;
		setPopupHeight((currentHeight) =>
			currentHeight === nextHeight ? currentHeight : nextHeight,
		);
	}, [panelFrames]);

	return (
		<header className="relative z-[60] flex h-11 shrink-0 items-center border-b-[0.5px] border-(--session-overview-border) bg-(--session-overview-surface) p-2">
			<nav aria-label="Session detail activity" className="w-full min-w-0">
				<ul className="flex min-w-0 items-center gap-2 overflow-x-auto">
					{groups.map((group) => (
						<SessionDetailActivityMenuItem
							group={group}
							isOpen={openKind === group.kind}
							key={group.kind}
							onKeyDown={handleKeyDown}
							onPointerEnter={handlePointerEnter}
							onPointerLeave={handlePointerLeave}
							onPointerMove={handlePointerMove}
							onSelect={openMenu}
							triggerRef={(element) => {
								if (element) {
									triggerElementsRef.current.set(group.kind, element);
								} else {
									triggerElementsRef.current.delete(group.kind);
								}
							}}
						/>
					))}
				</ul>
				{panelFrames.length > 0 ? (
					<div
						className="session-detail-opaline-menu absolute top-[calc(100%+1px)] right-0 left-0 overflow-hidden rounded-xl bg-white/90 text-[#282a30] shadow-[0_8px_32px_#08090a0d] ring-1 ring-black/8 backdrop-blur-2xl outline-none dark:bg-[#08090ae6] dark:text-[#f7f8f8] dark:shadow-[0_8px_32px_#08090a] dark:ring-white/8"
						data-state={popupState}
						onPointerEnter={() => clearTimer(closeTimerRef.current)}
						onPointerLeave={scheduleClose}
						style={{ height: popupHeight }}
					>
						{panelFrames.map((frame) => (
							<div
								className="session-detail-opaline-panel"
								data-active={frame.group.kind === openKind}
								data-motion={frame.motion}
								key={frame.id}
							>
								<div
									ref={(element) => {
										if (element) {
											panelElementsRef.current.set(frame.id, element);
										} else {
											panelElementsRef.current.delete(frame.id);
										}
									}}
								>
									<SessionDetailActivityPanel
										group={frame.group}
										onClose={closeMenu}
										onJump={onJump}
									/>
								</div>
							</div>
						))}
					</div>
				) : null}
			</nav>
		</header>
	);
}
