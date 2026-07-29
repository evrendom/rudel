import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	useRef,
	useState,
} from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/app/ui/sheet";
import { SessionDetailView } from "@/features/sessions/components/SessionDetailView";
import type { SessionDetailNavigation } from "@/features/sessions/components/session-detail-view-types";

const SESSION_PANEL_MIN_WIDTH = 640;
const SESSION_PANEL_MAX_VIEWPORT_RATIO = 0.72;
const SESSION_PANEL_KEYBOARD_STEP = 32;
const SESSION_ROW_SELECTOR = '[data-dashboard-grid-row-scope="session"]';

interface SessionDetailPanelStyle extends CSSProperties {
	"--session-detail-width": string;
}

type ResizeStart = {
	pointerId: number;
	startWidth: number;
	startX: number;
};

function clampSessionPanelWidth(width: number) {
	const maxWidth = window.innerWidth * SESSION_PANEL_MAX_VIEWPORT_RATIO;
	const minWidth = Math.min(SESSION_PANEL_MIN_WIDTH, maxWidth);

	return Math.min(maxWidth, Math.max(minWidth, width));
}

function SessionDetailResizeHandle({
	onWidthChange,
}: {
	onWidthChange: (width: number | undefined) => void;
}) {
	const resizeStart = useRef<ResizeStart | null>(null);

	const stopResize = (event: PointerEvent<HTMLButtonElement>) => {
		if (resizeStart.current?.pointerId !== event.pointerId) {
			return;
		}

		resizeStart.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const resizeFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}

		const panel = event.currentTarget.parentElement;
		if (!panel) {
			return;
		}

		event.preventDefault();
		const direction = event.key === "ArrowLeft" ? 1 : -1;
		const nextWidth =
			panel.getBoundingClientRect().width +
			direction * SESSION_PANEL_KEYBOARD_STEP;
		onWidthChange(clampSessionPanelWidth(nextWidth));
	};

	return (
		<button
			type="button"
			aria-label="Resize session panel"
			className="group absolute inset-y-0 left-0 z-30 flex w-3 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none max-lg:hidden"
			onDoubleClick={() => onWidthChange(undefined)}
			onKeyDown={resizeFromKeyboard}
			onPointerCancel={stopResize}
			onPointerDown={(event) => {
				if (event.button !== 0) {
					return;
				}

				const panel = event.currentTarget.parentElement;
				if (!panel) {
					return;
				}

				event.preventDefault();
				resizeStart.current = {
					pointerId: event.pointerId,
					startWidth: panel.getBoundingClientRect().width,
					startX: event.clientX,
				};
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				const start = resizeStart.current;
				if (!start || start.pointerId !== event.pointerId) {
					return;
				}

				const nextWidth = start.startWidth + start.startX - event.clientX;
				onWidthChange(clampSessionPanelWidth(nextWidth));
			}}
			onPointerUp={stopResize}
		>
			<span
				aria-hidden="true"
				className="h-12 w-0.5 rounded-full bg-[color:var(--dashboardy-border-strong)] opacity-50 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100"
			/>
		</button>
	);
}

export function SessionDetailSheet({
	sessionId,
	open,
	onOpenChange,
	onOpenChangeComplete,
	navigation,
}: {
	sessionId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete: (open: boolean) => void;
	navigation?: SessionDetailNavigation;
}) {
	const [panelWidth, setPanelWidth] = useState<number>();
	const panelStyle: SessionDetailPanelStyle = {
		"--session-detail-width":
			panelWidth === undefined ? "60vw" : `${panelWidth}px`,
	};

	return (
		<Sheet
			modal={false}
			open={open}
			onOpenChangeComplete={onOpenChangeComplete}
			onOpenChange={(open, eventDetails) => {
				const eventTarget = eventDetails.event.target;
				const isSessionRowPress =
					eventDetails.reason === "outside-press" &&
					eventTarget instanceof Element &&
					eventTarget.closest(SESSION_ROW_SELECTOR) !== null;

				if (isSessionRowPress) {
					eventDetails.cancel();
					return;
				}

				onOpenChange(open);
			}}
		>
			<SheetContent
				className="dashboardy-page max-w-none overflow-hidden border-0 bg-[color:var(--dashboardy-surface)] p-0 text-[color:var(--dashboardy-heading)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.22)] transition-transform data-ending-style:opacity-100 data-starting-style:opacity-100 data-[side=right]:w-[90vw] data-[side=right]:border-0 data-[side=right]:data-ending-style:translate-x-full data-[side=right]:data-starting-style:translate-x-full data-[side=right]:sm:w-[72vw] data-[side=right]:sm:max-w-[72vw] data-[side=right]:md:inset-y-[var(--dashboard-01-window-inset)] data-[side=right]:md:right-[var(--dashboard-01-window-inset)] data-[side=right]:md:h-auto data-[side=right]:md:rounded-[var(--dashboard-01-window-radius)] data-[side=right]:lg:w-[var(--session-detail-width)] data-[side=right]:lg:min-w-[40rem]"
				overlayClassName="pointer-events-none bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
				showCloseButton={false}
				style={panelStyle}
			>
				<SessionDetailResizeHandle onWidthChange={setPanelWidth} />
				<SheetHeader className="sr-only">
					<SheetTitle>Session details</SheetTitle>
					<SheetDescription>
						Inspect the full conversation, token usage, and tool activity for
						the selected session.
					</SheetDescription>
				</SheetHeader>
				{sessionId ? (
					<SessionDetailView
						sessionId={sessionId}
						trackView={false}
						navigation={navigation}
						onClose={() => onOpenChange(false)}
					/>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
