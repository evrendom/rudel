import type { TraceEvent } from "./conversation-trace";

export type AgentTraceTreeBranch = {
	children: TraceEvent[];
	id: string;
	root: Extract<TraceEvent, { kind: "message" | "reasoning" }> | undefined;
};

export function buildAgentTraceTreeBranches(events: TraceEvent[]) {
	const branches: AgentTraceTreeBranch[] = [];
	let activeBranch: AgentTraceTreeBranch | undefined;

	for (const event of events) {
		if (event.kind === "message" || event.kind === "reasoning") {
			activeBranch = { children: [], id: event.id, root: event };
			branches.push(activeBranch);
			continue;
		}
		if (!activeBranch) {
			activeBranch = {
				children: [],
				id: `${event.id}:activity`,
				root: undefined,
			};
			branches.push(activeBranch);
		}
		activeBranch.children.push(event);
	}
	return branches;
}
