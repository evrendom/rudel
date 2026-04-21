import {
	clearWrappedCompleted,
	getWrappedCompletionStorageKey,
	hasCompletedWrapped,
	isWrappedLaunchEligible,
	markWrappedCompleted,
} from "@/features/wrapped/entry";

export const isWalkInLaunchEligible = isWrappedLaunchEligible;
export const hasCompletedWalkIn = hasCompletedWrapped;
export const markWalkInCompleted = markWrappedCompleted;
export const clearWalkInCompleted = clearWrappedCompleted;
export const getWalkInCompletionStorageKey = getWrappedCompletionStorageKey;
