import type { TraceEvent } from "./conversation-trace";

export type AgentTraceTreeBranch = {
	childStartIndex: number;
	children: readonly TraceEvent[];
	hasFollowingBranch: boolean;
	hasRoot: boolean;
	id: string;
	root: Extract<TraceEvent, { kind: "message" | "reasoning" }> | undefined;
	totalChildren: number;
};

type MutableAgentTraceTreeBranch = {
	children: TraceEvent[];
	id: string;
	root: Extract<TraceEvent, { kind: "message" | "reasoning" }> | undefined;
};

export type AgentTraceTreeEventGeometry = {
	continues: boolean;
	depthOffset: 0 | 1;
	descends: boolean;
	event: TraceEvent;
	parentContinues: boolean | undefined;
};

export function buildAgentTraceTreeBranches(events: readonly TraceEvent[]) {
	const branches: MutableAgentTraceTreeBranch[] = [];
	let activeBranch: MutableAgentTraceTreeBranch | undefined;

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
	return branches.map<AgentTraceTreeBranch>((branch, branchIndex) => ({
		childStartIndex: 0,
		children: branch.children,
		hasFollowingBranch: branchIndex < branches.length - 1,
		hasRoot: branch.root !== undefined,
		id: branch.id,
		root: branch.root,
		totalChildren: branch.children.length,
	}));
}

export function getAgentTraceTreeEventGeometry(
	branch: AgentTraceTreeBranch,
	hasNextSection: boolean,
): AgentTraceTreeEventGeometry[] {
	const rootContinues = branch.hasFollowingBranch || hasNextSection;
	const root = branch.root
		? [
				{
					continues: rootContinues,
					depthOffset: 0 as const,
					descends: branch.totalChildren > 0,
					event: branch.root,
					parentContinues: undefined,
				},
			]
		: [];
	const children = branch.children.map<AgentTraceTreeEventGeometry>(
		(event, childIndex) => {
			const hasFollowingChild =
				branch.childStartIndex + childIndex < branch.totalChildren - 1;
			return {
				continues: branch.hasRoot
					? hasFollowingChild
					: hasFollowingChild || rootContinues,
				depthOffset: branch.hasRoot ? 1 : 0,
				descends: false,
				event,
				parentContinues: branch.hasRoot ? rootContinues : undefined,
			};
		},
	);
	return [...root, ...children];
}
