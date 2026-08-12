import { useEffectEvent, useId, useMemo, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { SessionAdalineDetailPane } from "./session-adaline-detail-pane";
import {
	buildSessionAdalineMessageRows,
	type SessionAdalineMessageRow,
	type SessionAdalineMessageSpeaker,
} from "./session-adaline-message-rows";
import type { SessionAdalineOption } from "./session-adaline-model";
import { SessionAdalineSessionStrip } from "./session-adaline-session-strip";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionTurnTablePane } from "./session-turn-table-pane";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return (
		target.isContentEditable ||
		target.closest(
			'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="menu"]',
		) !== null
	);
}

function findLastModelRow(
	rows: readonly SessionAdalineMessageRow[],
	turnIndex: number,
) {
	for (let index = rows.length - 1; index >= 0; index--) {
		const row = rows[index];
		if (row?.match.index === turnIndex && row.speaker === "model") {
			return row;
		}
	}

	return undefined;
}

function ShortcutLegendItem({
	command,
	label,
}: {
	command: string;
	label: string;
}) {
	return (
		<div className="flex shrink-0 items-center gap-2">
			<p className="text-base text-(--session-overview-subtle) sm:text-xs">
				{label}
			</p>
			<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-(--session-overview-border) px-1.5 font-mono text-xs text-(--session-overview-muted)">
				{command}
			</kbd>
		</div>
	);
}

export function SessionAdalineLayout({
	options,
	userImageUrl,
	viewModel,
}: {
	options: readonly SessionAdalineOption[];
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const tableId = useId();
	const [selection, setSelection] = useState<
		| {
				index: number;
				key: string;
				speaker: SessionAdalineMessageSpeaker;
		  }
		| undefined
	>();
	const [maximized, setMaximized] = useState(false);
	const messageRows = useMemo(
		() =>
			buildSessionAdalineMessageRows(
				options.map((option, index) => ({ index, option })),
			),
		[options],
	);
	const selectedIndex = selection?.index;
	const selectedMessageRow = messageRows.find(
		(row) => row.key === selection?.key,
	);
	const selectedOption =
		selectedIndex === undefined ? undefined : options[selectedIndex];

	function selectTurn(index: number) {
		const row = findLastModelRow(messageRows, index);
		if (!row) {
			return;
		}

		setSelection({ index, key: row.key, speaker: row.speaker });
		setMaximized(false);
	}

	function selectMessage(row: SessionAdalineMessageRow) {
		setSelection({
			index: row.match.index,
			key: row.key,
			speaker: row.speaker,
		});
		setMaximized(false);
	}

	function moveSelection(direction: -1 | 1) {
		if (messageRows.length === 0) {
			return;
		}

		const currentIndex = selectedMessageRow
			? messageRows.indexOf(selectedMessageRow)
			: direction > 0
				? -1
				: messageRows.length;
		const nextIndex = Math.min(
			Math.max(currentIndex + direction, 0),
			messageRows.length - 1,
		);
		const nextRow = messageRows[nextIndex];
		if (nextRow) {
			selectMessage(nextRow);
		}
	}

	const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (
			event.defaultPrevented ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			isEditableTarget(event.target)
		) {
			return;
		}

		if (event.key === "Escape" && selectedIndex !== undefined) {
			event.preventDefault();
			setSelection(undefined);
			setMaximized(false);
			return;
		}

		if (event.key.toLowerCase() === "j") {
			event.preventDefault();
			moveSelection(1);
		}

		if (event.key.toLowerCase() === "k") {
			event.preventDefault();
			moveSelection(-1);
		}
	});

	useMountEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	});

	return (
		<div className="isolate flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface) antialiased [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<SessionAdalineSessionStrip options={options} viewModel={viewModel} />

			<div className="relative min-h-0 flex-1 overflow-hidden">
				<section
					id={tableId}
					aria-label="Session turn table"
					className="flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface)"
				>
					<SessionTurnTablePane
						collapseControlsId={undefined}
						model={viewModel.safeModelUsed}
						onCollapse={undefined}
						onSelect={selectTurn}
						onSelectMessage={selectMessage}
						options={options}
						selectedIndex={selectedIndex ?? -1}
						selectedMessageKey={selection?.key}
						selectedMessageSpeaker={selection?.speaker}
						showMessageRows
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
					/>
				</section>

				{selectedOption && selectedMessageRow ? (
					<aside
						role="dialog"
						aria-label={`Details for the selected ${selectedMessageRow.speaker} message`}
						aria-modal="false"
						className={
							maximized
								? "absolute inset-y-0 right-0 z-30 w-full border-l border-(--session-overview-border) shadow-lg dark:shadow-none"
								: "absolute inset-y-0 right-0 z-30 w-full border-l border-(--session-overview-border) shadow-lg dark:shadow-none lg:w-[min(58rem,48vw)]"
						}
					>
						<SessionAdalineDetailPane
							key={selectedMessageRow.key}
							maximized={maximized}
							nextDisabled={
								messageRows.indexOf(selectedMessageRow) ===
								messageRows.length - 1
							}
							onClose={() => {
								setSelection(undefined);
								setMaximized(false);
							}}
							onNext={() => moveSelection(1)}
							onPrevious={() => moveSelection(-1)}
							onToggleMaximized={() => setMaximized((current) => !current)}
							option={selectedOption}
							previousDisabled={messageRows.indexOf(selectedMessageRow) === 0}
							row={selectedMessageRow}
						/>
					</aside>
				) : null}
			</div>

			<footer className="flex min-h-9 shrink-0 items-center gap-6 overflow-x-auto overscroll-x-contain border-t border-(--session-overview-border) px-3">
				<ShortcutLegendItem command="J" label="next" />
				<ShortcutLegendItem command="K" label="previous" />
				<ShortcutLegendItem command="↵" label="open message" />
				<ShortcutLegendItem command="Esc" label="close" />
			</footer>
		</div>
	);
}
