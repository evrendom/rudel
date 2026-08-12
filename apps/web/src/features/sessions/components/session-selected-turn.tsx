import { Wrench } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
	ConversationTrace,
	type ConversationTraceSpeakerLayout,
	type TraceCallVariant,
} from "@/components/conversation/ConversationTrace";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { isCodexFormat } from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { CollapsiblePrompt, SessionMemberRow } from "./session-member-row";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurn } from "./session-turns";

export { SessionMemberRow } from "./session-member-row";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export interface SelectedTurnOption extends SessionTurnTablePaneOption {
	turn: SessionTurn;
}

export type SessionThreadTransitionDirection = -1 | 0 | 1;

type SessionThreadWindow = {
	followingOption: SelectedTurnOption | undefined;
	nextOption: SelectedTurnOption | undefined;
	option: SelectedTurnOption | undefined;
};

type SessionThreadTransition = {
	direction: SessionThreadTransitionDirection;
	from: SessionThreadWindow;
	to: SessionThreadWindow;
};

type SessionThreadUnit =
	| {
			key: string;
			kind: "member";
			option: SelectedTurnOption;
			presentation: SessionThreadUnitPresentation;
	  }
	| {
			key: string;
			kind: "model";
			option: SelectedTurnOption;
			presentation: SessionThreadUnitPresentation;
	  };

type SessionThreadUnitPresentation =
	| "focused"
	| "preview-70"
	| "preview-80"
	| "preview-90";

const SESSION_THREAD_TRANSITION_DURATION_MS = 320;
const SESSION_THREAD_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function getSessionThreadUnits({
	followingOption,
	nextOption,
	option,
}: SessionThreadWindow): SessionThreadUnit[] {
	if (!option) {
		return [];
	}

	const units: SessionThreadUnit[] = [];
	if (option.turn.userItems.length > 0) {
		units.push({
			key: `member-${option.key}`,
			kind: "member",
			option,
			presentation: "focused",
		});
	}
	units.push({
		key: `model-${option.key}`,
		kind: "model",
		option,
		presentation: "focused",
	});
	if (nextOption && nextOption.turn.userItems.length > 0) {
		units.push({
			key: `member-${nextOption.key}`,
			kind: "member",
			option: nextOption,
			presentation: "focused",
		});
	}
	if (nextOption && nextOption.turn.responseItems.length > 0) {
		units.push({
			key: `model-${nextOption.key}`,
			kind: "model",
			option: nextOption,
			presentation: "preview-90",
		});
	}
	if (followingOption && followingOption.turn.userItems.length > 0) {
		units.push({
			key: `member-${followingOption.key}`,
			kind: "member",
			option: followingOption,
			presentation: "preview-80",
		});
	}
	if (followingOption && followingOption.turn.responseItems.length > 0) {
		units.push({
			key: `model-${followingOption.key}`,
			kind: "model",
			option: followingOption,
			presentation: "preview-70",
		});
	}

	return units;
}

function getTransitionSessionThreadUnits({
	direction,
	from,
	to,
}: SessionThreadTransition): SessionThreadUnit[] {
	const fromUnits = getSessionThreadUnits(from);
	const toUnits = getSessionThreadUnits(to);

	if (direction < 0) {
		const toKeys = new Set(toUnits.map((unit) => unit.key));
		return [...toUnits, ...fromUnits.filter((unit) => !toKeys.has(unit.key))];
	}

	const toUnitsByKey = new Map(toUnits.map((unit) => [unit.key, unit]));
	const fromKeys = new Set(fromUnits.map((unit) => unit.key));
	return [
		...fromUnits.map((unit) => toUnitsByKey.get(unit.key) ?? unit),
		...toUnits.filter((unit) => !fromKeys.has(unit.key)),
	];
}

export function SelectedTurnResponseTrace({
	agentHeaderTrailing,
	agentSectionMode,
	option,
	speakerLayout,
	traceCallVariant = "v1",
	userImageUrl,
	viewModel,
}: {
	agentHeaderTrailing?: ReactNode;
	agentSectionMode: "collapsible" | "expanded";
	option: SelectedTurnOption;
	speakerLayout: ConversationTraceSpeakerLayout;
	traceCallVariant?: TraceCallVariant;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	if (option.turn.responseItems.length === 0) {
		return (
			<p className="py-10 text-center text-sm text-(--session-overview-muted)">
				No response recorded
			</p>
		);
	}

	return (
		<ConversationTrace
			key={option.key}
			agentLabel={
				viewModel.safeModelUsed
					? formatModelDisplayLabel(viewModel.safeModelUsed)
					: undefined
			}
			agentHeaderTrailing={agentHeaderTrailing}
			agentModel={viewModel.safeModelUsed}
			agentSectionMode={agentSectionMode}
			expandedSpeakerLayout={speakerLayout}
			items={option.turn.responseItems}
			requestUsage={option.metrics.usageEvents}
			requestUsagePlacement={
				isCodexFormat(viewModel.safeContent) ? "end" : "start"
			}
			traceCallVariant={traceCallVariant}
			userImageUrl={userImageUrl}
			userLabel={viewModel.safeUserDisplayName}
		/>
	);
}

export function SessionSelectedTurn({
	followingOption,
	nextOption,
	option,
	tableExperiment,
	transitionDirection,
	userImageUrl,
	viewModel,
}: {
	followingOption: SelectedTurnOption | undefined;
	nextOption: SelectedTurnOption | undefined;
	option: SelectedTurnOption | undefined;
	tableExperiment: boolean;
	transitionDirection: SessionThreadTransitionDirection;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const [displayWindow, setDisplayWindow] = useState<SessionThreadWindow>(
		() => ({
			followingOption,
			nextOption,
			option,
		}),
	);
	const [threadTransition, setThreadTransition] =
		useState<SessionThreadTransition | null>(null);
	const threadElementRef = useRef<HTMLDivElement>(null);
	const threadUnitElementsRef = useRef(new Map<string, HTMLDivElement>());
	const threadUnits = threadTransition
		? getTransitionSessionThreadUnits(threadTransition)
		: getSessionThreadUnits(displayWindow);

	useLayoutEffect(() => {
		if (threadTransition) {
			return;
		}

		if (!tableExperiment) {
			if (
				displayWindow.option !== option ||
				displayWindow.nextOption !== nextOption ||
				displayWindow.followingOption !== followingOption
			) {
				setDisplayWindow({ followingOption, nextOption, option });
			}
			return;
		}

		if (displayWindow.option?.key !== option?.key) {
			setThreadTransition({
				direction: transitionDirection,
				from: displayWindow,
				to: { followingOption, nextOption, option },
			});
			return;
		}

		if (
			displayWindow.option !== option ||
			displayWindow.nextOption !== nextOption ||
			displayWindow.followingOption !== followingOption
		) {
			setDisplayWindow({ followingOption, nextOption, option });
		}
	}, [
		displayWindow,
		followingOption,
		nextOption,
		option,
		tableExperiment,
		threadTransition,
		transitionDirection,
	]);

	useLayoutEffect(() => {
		const threadElement = threadElementRef.current;
		if (!threadElement) {
			return;
		}

		if (!threadTransition) {
			threadElement.style.removeProperty("transform");
			threadElement.style.removeProperty("will-change");
			return;
		}

		const fromUnitKey = getSessionThreadUnits(threadTransition.from)[0]?.key;
		const toUnitKey = getSessionThreadUnits(threadTransition.to)[0]?.key;
		const fromUnitElement = fromUnitKey
			? threadUnitElementsRef.current.get(fromUnitKey)
			: undefined;
		const toUnitElement = toUnitKey
			? threadUnitElementsRef.current.get(toUnitKey)
			: undefined;

		if (!fromUnitElement || !toUnitElement) {
			setDisplayWindow(threadTransition.to);
			setThreadTransition(null);
			return;
		}

		const startY = -fromUnitElement.offsetTop;
		const endY = -toUnitElement.offsetTop;
		const startTransform = `translate3d(0, ${startY}px, 0)`;
		const endTransform = `translate3d(0, ${endY}px, 0)`;
		threadElement.style.transform = startTransform;
		threadElement.style.willChange = "transform";

		const reduceMotion =
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduceMotion || threadTransition.direction === 0 || startY === endY) {
			setDisplayWindow(threadTransition.to);
			setThreadTransition(null);
			return;
		}

		const animation = threadElement.animate(
			[{ transform: startTransform }, { transform: endTransform }],
			{
				duration: SESSION_THREAD_TRANSITION_DURATION_MS,
				easing: SESSION_THREAD_TRANSITION_EASING,
				fill: "forwards",
			},
		);
		let active = true;
		animation.addEventListener("finish", () => {
			if (!active) {
				return;
			}
			setDisplayWindow(threadTransition.to);
			setThreadTransition(null);
		});

		return () => {
			active = false;
			animation.cancel();
		};
	}, [threadTransition]);

	if (!option) {
		return (
			<div className="flex min-h-60 items-center justify-center border-b border-(--session-overview-border) p-8 text-center text-sm text-(--session-overview-muted)">
				No conversation data available
			</div>
		);
	}

	return (
		<>
			<header className="sticky top-0 z-50 isolate flex h-10 items-center justify-between gap-4 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-5">
				<h2 className="text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)">
					{option.turnNumber === undefined
						? "Session start"
						: `Turn ${option.turnNumber}`}
				</h2>
				<div className="flex shrink-0 items-center gap-3 text-xs text-(--session-overview-muted)">
					{option.toolCallCount > 0 ? (
						<span className="flex items-center gap-1 tabular-nums">
							<Wrench aria-hidden="true" className="size-4" />
							{option.toolCallCount}
							<span className="sr-only"> tool calls</span>
						</span>
					) : null}
					{option.timing.startTime ? (
						<time className="font-mono tabular-nums">
							{option.timing.startTime}
						</time>
					) : null}
				</div>
			</header>

			{tableExperiment ? (
				<div className="relative mx-auto w-full max-w-[62rem] overflow-hidden px-6">
					<div
						ref={threadElementRef}
						className={cn(threadTransition && "pointer-events-none")}
					>
						{threadUnits.map((unit, index) => (
							<div
								key={unit.key}
								data-preview={unit.presentation === "focused" ? undefined : ""}
								ref={(element) => {
									if (element) {
										threadUnitElementsRef.current.set(unit.key, element);
									} else {
										threadUnitElementsRef.current.delete(unit.key);
									}
								}}
								className={cn(
									index > 0 && "border-t border-(--session-overview-border)",
									"relative h-auto origin-top-left overflow-hidden [interpolate-size:allow-keywords] transition-[filter,height,margin-bottom,opacity,transform] duration-300 ease-out after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-16 after:bg-linear-to-b after:from-transparent after:to-(--session-overview-surface) after:opacity-0 after:transition-opacity after:duration-300 data-preview:after:opacity-100 motion-reduce:transition-none motion-reduce:after:transition-none",
									unit.presentation !== "focused" &&
										"h-44 grayscale opacity-50",
									unit.presentation === "preview-90" && "-mb-[1.1rem] scale-90",
									unit.presentation === "preview-80" &&
										"-mb-[2.2rem] scale-[0.8]",
									unit.presentation === "preview-70" &&
										"-mb-[3.3rem] scale-[0.7]",
								)}
							>
								{unit.kind === "member" ? (
									<SessionMemberRow
										headingId={`selected-member-message-${unit.option.key}`}
										items={unit.option.turn.userItems}
										speakerLayout="inline"
										userImageUrl={userImageUrl}
										userLabel={viewModel.safeUserDisplayName}
									/>
								) : (
									<section
										aria-label={
											unit.option.turnNumber === undefined
												? "Preamble"
												: "Response"
										}
										className="py-5"
									>
										<SelectedTurnResponseTrace
											agentSectionMode="expanded"
											option={unit.option}
											speakerLayout="inline"
											userImageUrl={userImageUrl}
											viewModel={viewModel}
										/>
									</section>
								)}
							</div>
						))}
					</div>
				</div>
			) : (
				<>
					{option.turn.userItems.length > 0 ? (
						<section
							aria-labelledby="selected-user-message-heading"
							className="border-b border-(--session-overview-border)"
						>
							<div className="flex h-10 items-center gap-2 border-b border-(--session-overview-border) px-5">
								<h3
									id="selected-user-message-heading"
									className="text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)"
								>
									Prompt
								</h3>
								<span className="truncate text-sm tracking-[-0.01em] text-(--session-overview-muted)">
									{viewModel.safeUserDisplayName}
								</span>
							</div>
							<div className="mx-auto grid w-full max-w-[62rem] divide-y divide-(--session-overview-border) px-6">
								{option.turn.userItems.map((item) =>
									item.kind === "user" ? (
										<div
											key={item.id}
											className="min-w-0 py-5 text-[0.8125rem] leading-6 text-(--session-overview-text)"
										>
											<CollapsiblePrompt content={item.content} />
										</div>
									) : null,
								)}
							</div>
						</section>
					) : null}

					<section aria-labelledby="selected-response-heading">
						<div className="flex h-10 items-center border-b border-(--session-overview-border) px-5">
							<h3
								id="selected-response-heading"
								className="text-sm font-medium tracking-[-0.01em] text-(--session-overview-text)"
							>
								{option.turnNumber === undefined ? "Preamble" : "Response"}
							</h3>
						</div>
						<div className="mx-auto w-full max-w-[62rem] px-6 py-5">
							<SelectedTurnResponseTrace
								agentSectionMode="collapsible"
								option={option}
								speakerLayout="inline"
								userImageUrl={userImageUrl}
								viewModel={viewModel}
							/>
						</div>
					</section>
				</>
			)}
		</>
	);
}
