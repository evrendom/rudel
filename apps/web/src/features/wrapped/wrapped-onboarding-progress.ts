import type { WrappedPrimaryStep } from "@/features/wrapped/onboarding/config";
import { WRAPPED_SATURDAY_STEPS } from "@/features/wrapped/onboarding/config";

const WRAPPED_ROUTE_PROGRESS_STEPS = [
	{ id: "account-check", label: "Check access" },
	{ id: "desktop-ready", label: "Connect sessions" },
	{ id: "sessions-landed", label: "Sessions landed" },
] as const;

const WRAPPED_STORY_PROGRESS_LABELS: Partial<
	Record<WrappedPrimaryStep["id"], string>
> = {
	card: "Choose your card",
	intro: "Start your story",
	model: "Compare sources",
	pulse: "Check repo pulse",
	scale: "See the scale",
};

type WrappedRouteProgressStepId =
	(typeof WRAPPED_ROUTE_PROGRESS_STEPS)[number]["id"];

export type WrappedOnboardingProgressStepId =
	| WrappedRouteProgressStepId
	| WrappedPrimaryStep["id"];

export interface WrappedOnboardingProgressItem {
	id: WrappedOnboardingProgressStepId;
	isActive: boolean;
	label: string;
	stepNumber: number;
}

export interface WrappedOnboardingProgressView {
	activeItem: WrappedOnboardingProgressItem;
	items: readonly WrappedOnboardingProgressItem[];
	total: number;
}

export function getWrappedOnboardingProgressView(
	activeStepId: WrappedOnboardingProgressStepId,
): WrappedOnboardingProgressView {
	const items = getWrappedOnboardingProgressItems().map((item) => ({
		...item,
		isActive: item.id === activeStepId,
	}));
	const activeItem =
		items.find((item) => item.id === activeStepId) ?? items[0] ?? null;

	if (!activeItem) {
		throw new Error("Wrapped onboarding progress is missing steps.");
	}

	return {
		activeItem,
		items,
		total: items.length,
	};
}

function getWrappedOnboardingProgressItems(): WrappedOnboardingProgressItem[] {
	return [
		...WRAPPED_ROUTE_PROGRESS_STEPS,
		...WRAPPED_SATURDAY_STEPS.map((step) => ({
			id: step.id,
			label: WRAPPED_STORY_PROGRESS_LABELS[step.id] ?? step.label,
		})),
	].map((step, index) => ({
		...step,
		isActive: false,
		stepNumber: index + 1,
	}));
}
