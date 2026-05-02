import {
	WRAPPED_ARCHETYPE_GATE_THRESHOLDS,
	type WrappedV1ArchetypeGate,
	type WrappedV1ArchetypeGateReason,
} from "@rudel/api-routes";

interface BuildWrappedArchetypeGateInput {
	activeDays: number;
	distanceRatioToMax: number | null;
	topTwoMargin: number | null;
	totalSessions: number;
}

export function buildWrappedArchetypeGate(
	input: BuildWrappedArchetypeGateInput,
): WrappedV1ArchetypeGate {
	const reason = getWrappedArchetypeGateReason(input);

	return {
		is_eligible: reason === "eligible",
		reason,
		thresholds: WRAPPED_ARCHETYPE_GATE_THRESHOLDS,
		values: {
			total_sessions: input.totalSessions,
			active_days: input.activeDays,
			archetype_distance_ratio_to_max: input.distanceRatioToMax,
			archetype_top_two_margin: input.topTwoMargin,
		},
	};
}

function getWrappedArchetypeGateReason(
	input: BuildWrappedArchetypeGateInput,
): WrappedV1ArchetypeGateReason {
	if (
		input.totalSessions < WRAPPED_ARCHETYPE_GATE_THRESHOLDS.min_total_sessions
	) {
		return "needs_more_sessions";
	}

	if (input.activeDays < WRAPPED_ARCHETYPE_GATE_THRESHOLDS.min_active_days) {
		return "needs_more_active_days";
	}

	if (input.distanceRatioToMax === null || input.topTwoMargin === null) {
		return "processing_archetype";
	}

	if (
		input.distanceRatioToMax >
			WRAPPED_ARCHETYPE_GATE_THRESHOLDS.max_distance_ratio_to_max ||
		input.topTwoMargin < WRAPPED_ARCHETYPE_GATE_THRESHOLDS.min_top_two_margin
	) {
		return "low_confidence";
	}

	return "eligible";
}
