import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/app/ui/button";
import type {
	SessionDetailActivityGroup,
	SessionDetailActivityOccurrence,
} from "./session-detail-activity-groups";

export function SessionDetailActivityPanel({
	group,
	isLoading,
	onSelectOccurrence,
}: {
	group: SessionDetailActivityGroup;
	isLoading: boolean;
	onSelectOccurrence: (occurrence: SessionDetailActivityOccurrence) => void;
}) {
	return (
		<div className="min-h-0 overflow-hidden rounded-md">
			{group.occurrences.length > 0 ? (
				<div className="max-h-72 overflow-y-auto">
					<ul
						aria-label={`${group.label} occurrences`}
						className="grid grid-cols-2 gap-0.5 p-1"
					>
						{group.occurrences.map((occurrence) => (
							<li key={occurrence.key}>
								<button
									className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md px-4 py-3 text-left hover:bg-black/3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) dark:hover:bg-white/3"
									onClick={() => onSelectOccurrence(occurrence)}
									type="button"
								>
									<div className="min-w-0">
										<p className="whitespace-pre-wrap break-words text-[0.8125rem]/5 font-medium tracking-[-0.01em] text-[#3c4149] dark:text-[#d0d6e0]">
											{occurrence.detail}
										</p>
										{occurrence.supportingDetail ? (
											<p className="mt-0.5 text-[0.75rem]/4 tracking-[-0.01em] text-[#6f6e77] tabular-nums dark:text-[#b4bcd099]">
												{occurrence.supportingDetail}
											</p>
										) : null}
									</div>
									<div className="flex min-w-0 items-center gap-1.5 text-[#6f6e77] dark:text-[#b4bcd099]">
										<p className="truncate text-[0.8125rem]/5 tracking-[-0.01em] tabular-nums">
											{occurrence.turnLabel}
											{occurrence.time ? ` · ${occurrence.time}` : ""}
										</p>
										<ChevronRight
											aria-hidden="true"
											className="size-3.5 shrink-0"
										/>
									</div>
								</button>
							</li>
						))}
					</ul>
					{group.omittedCount > 0 ? (
						<p className="border-t border-black/6 px-4 py-2 text-[0.75rem]/4 text-[#6f6e77] tabular-nums dark:border-white/8 dark:text-[#b4bcd099]">
							+{group.omittedCount.toLocaleString()} more not shown
						</p>
					) : null}
					{isLoading ? (
						<p className="border-t border-black/6 px-4 py-2 text-[0.75rem]/4 text-[#6f6e77] dark:border-white/8 dark:text-[#b4bcd099]">
							Loading more signal occurrences…
						</p>
					) : null}
				</div>
			) : isLoading ? (
				<p className="px-4 py-3 text-base text-[#6f6e77] sm:text-[0.8125rem]/5 dark:text-[#b4bcd099]">
					Loading signal occurrences…
				</p>
			) : (
				<p className="px-4 py-3 text-base text-[#6f6e77] sm:text-[0.8125rem]/5 dark:text-[#b4bcd099]">
					{group.emptyLabel}
				</p>
			)}
		</div>
	);
}

export function SessionDetailActivityOccurrencePanel({
	group,
	onBack,
	onClose,
	onJump,
	occurrence,
}: {
	group: SessionDetailActivityGroup;
	onBack: () => void;
	onClose: () => void;
	onJump: (target: { eventId: string | undefined; turnIndex: number }) => void;
	occurrence: SessionDetailActivityOccurrence;
}) {
	return (
		<div className="min-h-0 overflow-hidden rounded-md">
			<div className="flex h-9 items-center border-b border-black/6 px-1 dark:border-white/8">
				<button
					aria-label={`Back to ${group.label}`}
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#5b5c5e] outline-none hover:bg-black/4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) dark:text-[#c4c4c6] dark:hover:bg-white/6"
					onClick={onBack}
					type="button"
				>
					<ArrowLeft aria-hidden="true" className="size-3.5" />
				</button>
				<p className="min-w-0 flex-1 truncate px-1 text-[0.8125rem]/5 font-medium">
					{group.label}
				</p>
			</div>
			<div className="p-4">
				<p className="whitespace-pre-wrap break-words text-[0.8125rem]/5 font-medium tracking-[-0.01em] text-[#3c4149] dark:text-[#d0d6e0]">
					{occurrence.detail}
				</p>
				{occurrence.supportingDetail ? (
					<p className="mt-1 text-[0.75rem]/4 tracking-[-0.01em] text-[#6f6e77] tabular-nums dark:text-[#b4bcd099]">
						{occurrence.supportingDetail}
					</p>
				) : null}
				<p className="mt-2 text-[0.75rem]/4 tracking-[-0.01em] text-[#6f6e77] tabular-nums dark:text-[#b4bcd099]">
					{occurrence.turnLabel}
					{occurrence.time ? ` · ${occurrence.time}` : ""}
				</p>
				<Button
					className="mt-3"
					onClick={() => {
						onJump({
							eventId: occurrence.eventId,
							turnIndex: occurrence.turnIndex,
						});
						window.setTimeout(onClose, 0);
					}}
					size="xs"
					type="button"
				>
					View in transcript
				</Button>
			</div>
		</div>
	);
}
