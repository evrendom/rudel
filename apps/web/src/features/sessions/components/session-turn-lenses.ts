import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionTurnLensId =
	| "commands"
	| "compactions"
	| "edits"
	| "errors"
	| "expensive"
	| "friction"
	| "skills";

export type SessionTurnLensInput = SessionTurnTableOption & {
	memberText: string;
};

export const SESSION_TURN_LENSES: readonly {
	id: SessionTurnLensId;
	label: string;
}[] = [
	{ id: "expensive", label: "Expensive" },
	{ id: "errors", label: "Errors" },
	{ id: "skills", label: "Skills" },
	{ id: "edits", label: "Edits" },
	{ id: "commands", label: "Commands" },
	{ id: "compactions", label: "Compactions" },
	{ id: "friction", label: "Friction" },
];

const FRICTION_PATTERN =
	/\b(fuck\w*|shit\w*|wtf|damn|ffs|why (the hell|on earth)|not working|still (broken|wrong|fails|failing))\b/iu;

function getExpensiveThreshold(inputs: readonly SessionTurnLensInput[]) {
	const costs = inputs
		.flatMap((input) =>
			input.metrics.estimatedCost === undefined
				? []
				: [input.metrics.estimatedCost],
		)
		.sort((left, right) => left - right);

	if (costs.length === 0) {
		return undefined;
	}

	return costs[Math.max(Math.ceil(costs.length * 0.9) - 1, 0)];
}

export function getSessionTurnLensMatches(
	inputs: readonly SessionTurnLensInput[],
	lensId: SessionTurnLensId,
) {
	const matches = new Set<number>();
	const expensiveThreshold =
		lensId === "expensive" ? getExpensiveThreshold(inputs) : undefined;

	inputs.forEach((input, index) => {
		let matchesLens = false;
		switch (lensId) {
			case "commands":
				matchesLens =
					input.turnNumber !== undefined && input.slashCommands.length > 0;
				break;
			case "compactions":
				matchesLens = input.compactionsBefore.length > 0;
				break;
			case "edits":
				matchesLens = input.metrics.editedFiles.length > 0;
				break;
			case "errors":
				matchesLens = input.metrics.errorCount > 0;
				break;
			case "expensive":
				matchesLens =
					expensiveThreshold !== undefined &&
					input.metrics.estimatedCost !== undefined &&
					input.metrics.estimatedCost >= expensiveThreshold;
				break;
			case "friction":
				matchesLens = FRICTION_PATTERN.test(input.memberText);
				break;
			case "skills":
				matchesLens = input.metrics.skills.length > 0;
				break;
		}

		if (matchesLens) {
			matches.add(index);
		}
	});

	return matches;
}
