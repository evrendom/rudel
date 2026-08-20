import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/app/ui/dropdown-menu";
import {
	ModelTraceIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import type { SessionTurnTableSpeaker } from "./session-turn-table";
import {
	type SessionTurnTableSpeakerSelection,
	toggleSessionTurnTableSpeakerVisibility,
} from "./session-turn-table-speaker-visibility";

const SESSION_TURN_TABLE_SPEAKERS: readonly SessionTurnTableSpeaker[] = [
	"member",
	"model",
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
		<span className="session-turn-table-model-icon-shell relative flex size-5 shrink-0">
			<ModelTraceIcon
				className="session-turn-table-model-icon size-5"
				expandable={false}
				expanded={false}
				model={model}
			/>
		</span>
	) : (
		<UserTraceAvatar
			className="size-5"
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
	userLabel,
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
	userLabel: string;
	visibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>;
}) {
	const modelLabel = model ? formatModelDisplayLabel(model) : "Model";
	const speakerLabels: Readonly<Record<SessionTurnTableSpeaker, string>> = {
		member: userLabel,
		model: modelLabel,
	};
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
	const visibleSpeakerLabel = SESSION_TURN_TABLE_SPEAKERS.filter((speaker) =>
		visibleSpeakers.has(speaker),
	)
		.map((speaker) => speakerLabels[speaker])
		.join(" and ");

	return (
		<fieldset
			className={cn(
				"session-constellation-tree m-0 flex h-full w-full min-w-0 shrink-0 items-center border-0 p-0 pl-1",
				className,
			)}
		>
			<legend className="sr-only">Visible turn table rows</legend>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							aria-label={`Choose visible rows: ${visibleSpeakerLabel}`}
							className="relative flex h-8 w-9 shrink-0 items-center justify-start rounded-sm outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-(--session-overview-accent)"
						/>
					}
				>
					<span
						aria-hidden="true"
						className="pointer-events-none flex items-center"
						data-trace-tree-row-content
					>
						{SESSION_TURN_TABLE_SPEAKERS.map((speaker, optionIndex) => {
							const selected = visibleSpeakers.has(speaker);
							return (
								<span
									key={speaker}
									className={cn(
										"relative flex size-5 shrink-0 items-center justify-center",
										optionIndex === 0 ? "z-0" : "z-10 -ml-3",
										!selected && "saturate-0 opacity-35",
									)}
									data-selected={selected}
									data-speaker-icon
									data-turn-table-speaker-trigger-icon={speaker}
								>
									<SessionTurnTableSpeakerIcon
										model={model}
										speaker={speaker}
										userImageUrl={userImageUrl}
									/>
								</span>
							);
						})}
					</span>
					<span
						aria-hidden="true"
						className="pointer-fine:hidden pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-auto min-w-40 rounded-lg bg-white p-1 text-black shadow-lg ring-1 ring-black/10"
					sideOffset={4}
				>
					{SESSION_TURN_TABLE_SPEAKERS.map((speaker) => {
						const selected = visibleSpeakers.has(speaker);
						const isOnlyVisible = selected && visibleSpeakers.size === 1;
						return (
							<DropdownMenuCheckboxItem
								key={speaker}
								checked={selected}
								className={cn(
									"rounded-md py-1.5 pr-7 pl-2 text-xs font-medium",
									!selected && "opacity-40",
								)}
								closeOnClick={false}
								data-turn-table-speaker={speaker}
								onCheckedChange={() => handleVisibilityToggle(speaker)}
								title={
									isOnlyVisible
										? "At least one row type must remain visible"
										: undefined
								}
							>
								<span
									className={cn("flex shrink-0", !selected && "saturate-0")}
								>
									<SessionTurnTableSpeakerIcon
										model={model}
										speaker={speaker}
										userImageUrl={userImageUrl}
									/>
								</span>
								{speakerLabels[speaker]}
							</DropdownMenuCheckboxItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</fieldset>
	);
}
