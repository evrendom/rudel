import { Check } from "lucide-react";
import {
	ModelTraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { cn } from "@/lib/utils";
import type { SessionTurnTableSpeaker } from "./session-turn-table";
import {
	type SessionTurnTableSpeakerSelection,
	toggleSessionTurnTableSpeakerVisibility,
} from "./session-turn-table-speaker-visibility";

const SESSION_TURN_TABLE_SPEAKERS: readonly {
	label: string;
	value: SessionTurnTableSpeaker;
}[] = [
	{ label: "Model", value: "model" },
	{ label: "User", value: "member" },
];

function SessionTurnTableSpeakerIcon({
	model,
	speaker,
	userImageUrl,
}: {
	model: string | undefined;
	speaker: SessionTurnTableSpeaker;
	userImageUrl: string | undefined;
}) {
	return speaker === "model" ? (
		<ModelTraceIcon
			className="size-4"
			expandable={false}
			expanded={false}
			model={model}
		/>
	) : (
		<UserTraceAvatar
			className="size-4"
			expandable={false}
			expanded={false}
			imageUrl={userImageUrl}
		/>
	);
}

export function SessionTurnTableSpeakerVisibilityControls({
	className,
	model,
	onPrimarySpeakerChange,
	onVisibleSpeakersChange,
	primarySpeaker,
	userImageUrl,
	visibleSpeakers,
}: {
	className: string | undefined;
	model: string | undefined;
	onPrimarySpeakerChange: (speaker: SessionTurnTableSpeaker) => void;
	onVisibleSpeakersChange: (
		speakers: ReadonlySet<SessionTurnTableSpeaker>,
	) => void;
	primarySpeaker: SessionTurnTableSpeaker;
	userImageUrl: string | undefined;
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>;
}) {
	function applySelection(selection: SessionTurnTableSpeakerSelection) {
		onVisibleSpeakersChange(selection.visibleSpeakers);
		onPrimarySpeakerChange(selection.primarySpeaker);
	}

	function handleVisibilityToggle(speaker: SessionTurnTableSpeaker) {
		applySelection(
			toggleSessionTurnTableSpeakerVisibility({
				primarySpeaker,
				speaker,
				visibleSpeakers,
			}),
		);
	}

	return (
		<fieldset className={cn("flex shrink-0 items-center", className)}>
			<legend className="sr-only">Visible turn table rows</legend>
			<div className="flex shrink-0 items-center gap-0.5 rounded-md bg-(--session-overview-hover) p-0.5">
				{SESSION_TURN_TABLE_SPEAKERS.map((option) => {
					const selected = visibleSpeakers.has(option.value);
					const isOnlyVisible = selected && visibleSpeakers.size === 1;

					return (
						<div
							key={option.value}
							className={cn(
								"flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-1.5",
								selected ? "opacity-100" : "opacity-45",
							)}
							data-turn-table-speaker={option.value}
						>
							<button
								type="button"
								aria-label={`${selected ? "Hide" : "Show"} ${option.label} rows`}
								aria-pressed={selected}
								className={cn(
									"relative flex size-3.5 shrink-0 items-center justify-center rounded-[3px] shadow-[inset_0_0_0_1px_var(--session-overview-border)] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
									selected
										? "bg-(--session-overview-accent) text-white shadow-none hover:brightness-90 dark:hover:brightness-110"
										: "hover:bg-[color-mix(in_srgb,var(--session-overview-accent)_14%,var(--session-overview-surface))] hover:shadow-[inset_0_0_0_1px_var(--session-overview-accent)]",
								)}
								title={
									isOnlyVisible
										? "At least one row type must remain visible"
										: `${selected ? "Hide" : "Show"} ${option.label} rows`
								}
								onClick={() => handleVisibilityToggle(option.value)}
							>
								<Check className={cn("size-3", !selected && "opacity-0")} />
								<span
									aria-hidden="true"
									className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
								/>
							</button>
							<span className="pointer-events-none">
								<SessionTurnTableSpeakerIcon
									model={model}
									speaker={option.value}
									userImageUrl={userImageUrl}
								/>
							</span>
						</div>
					);
				})}
			</div>
		</fieldset>
	);
}

export function SessionTurnTableSpeakerFocusToggle({
	className,
	model,
	onPrimarySpeakerChange,
	primarySpeaker,
	userImageUrl,
}: {
	className: string | undefined;
	model: string | undefined;
	onPrimarySpeakerChange: (speaker: SessionTurnTableSpeaker) => void;
	primarySpeaker: SessionTurnTableSpeaker;
	userImageUrl: string | undefined;
}) {
	return (
		<fieldset className={cn("flex items-center justify-center", className)}>
			<legend className="sr-only">Turn table column titles</legend>
			<div className="flex items-center gap-0.5 rounded-md bg-(--session-overview-hover) p-0.5">
				{SESSION_TURN_TABLE_SPEAKERS.map((option) => {
					const primary = primarySpeaker === option.value;

					return (
						<button
							type="button"
							key={option.value}
							aria-label={`Show ${option.label} column titles`}
							aria-pressed={primary}
							className={cn(
								"relative flex size-6 items-center justify-center rounded-sm outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent)",
								primary && "bg-(--session-overview-surface)",
								"opacity-100 hover:bg-(--session-overview-surface)",
							)}
							title={`Show ${option.label} column titles`}
							onClick={() => onPrimarySpeakerChange(option.value)}
						>
							<SessionTurnTableSpeakerIcon
								model={model}
								speaker={option.value}
								userImageUrl={userImageUrl}
							/>
							<span
								aria-hidden="true"
								className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
							/>
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}
