import type {
	SessionAdalineSpan,
	SessionAdalineSpanStatus,
} from "./session-adaline-model";

export type SessionTurnWaterfallTraceKind =
	| SessionAdalineSpan["kind"]
	| "activity"
	| "skill";

export type SessionTurnWaterfallTraceRow = {
	durationMs: number | undefined;
	id: string;
	kind: SessionTurnWaterfallTraceKind;
	label: string;
	preview: string;
	status: SessionAdalineSpanStatus;
	timestamp: string | undefined;
};

export type SessionTurnWaterfallTraceBranch = {
	children: readonly SessionTurnWaterfallTraceRow[];
	row: SessionTurnWaterfallTraceRow;
};

function toTraceRow(
	span: SessionAdalineSpan,
	skill: string | undefined,
): SessionTurnWaterfallTraceRow {
	const isSkill = span.kind === "tool" && span.label === "Skill";
	return {
		durationMs: span.durationMs,
		id: span.id,
		kind: isSkill ? "skill" : span.kind,
		label: isSkill && skill ? `Skill · ${skill}` : span.label,
		preview: span.preview,
		status: span.status,
		timestamp: span.timestamp,
	};
}

function createActivityBranch(
	child: SessionTurnWaterfallTraceRow,
): SessionTurnWaterfallTraceBranch {
	return {
		children: [child],
		row: {
			durationMs: child.durationMs,
			id: `${child.id}:activity`,
			kind: "activity",
			label: "Agent activity",
			preview: "Tool and skill activity without a recorded reasoning block",
			status: child.status,
			timestamp: child.timestamp,
		},
	};
}

export function buildSessionTurnWaterfallTrace(
	spans: readonly SessionAdalineSpan[],
	skills: readonly string[],
): readonly SessionTurnWaterfallTraceBranch[] {
	const branches: {
		children: SessionTurnWaterfallTraceRow[];
		row: SessionTurnWaterfallTraceRow;
	}[] = [];
	let activeAgentBranch: (typeof branches)[number] | undefined;
	let skillIndex = 0;

	for (const span of spans) {
		const skill =
			span.kind === "tool" && span.label === "Skill"
				? skills[skillIndex]
				: undefined;
		if (skill) {
			skillIndex += 1;
		}
		const row = toTraceRow(span, skill);
		if (row.kind === "member") {
			continue;
		}

		if (row.kind === "reasoning" || row.kind === "message") {
			const branch = { children: [], row };
			branches.push(branch);
			activeAgentBranch = branch;
			continue;
		}

		if (row.kind === "tool" || row.kind === "skill" || row.kind === "result") {
			if (activeAgentBranch) {
				activeAgentBranch.children.push(row);
			} else {
				const branch = createActivityBranch(row);
				branches.push({ children: [...branch.children], row: branch.row });
				activeAgentBranch = branches.at(-1);
			}
			continue;
		}

		branches.push({ children: [], row });
		activeAgentBranch = undefined;
	}

	const remainingSkills = skills.slice(skillIndex);
	if (remainingSkills.length > 0) {
		let skillParent = [...branches]
			.reverse()
			.find(
				(branch) =>
					branch.row.kind === "reasoning" || branch.row.kind === "message",
			);
		if (!skillParent) {
			const firstSkill = remainingSkills[0];
			if (firstSkill) {
				const branch = createActivityBranch({
					durationMs: undefined,
					id: `skill:${firstSkill}`,
					kind: "skill",
					label: `Skill · ${firstSkill}`,
					preview: "Skill used during this turn",
					status: "success",
					timestamp: undefined,
				});
				skillParent = { children: [...branch.children], row: branch.row };
				branches.push(skillParent);
			}
		}

		if (skillParent) {
			const alreadyAdded = new Set(
				skillParent.children
					.filter((child) => child.kind === "skill")
					.map((child) => child.label),
			);
			for (const skill of remainingSkills) {
				const label = `Skill · ${skill}`;
				if (alreadyAdded.has(label)) {
					continue;
				}
				skillParent.children.push({
					durationMs: undefined,
					id: `skill:${skill}`,
					kind: "skill",
					label,
					preview: "Skill used during this turn",
					status: "success",
					timestamp: undefined,
				});
			}
		}
	}

	return branches;
}
