import { createHash, type Hash } from "node:crypto";
import type { IngestSessionInput } from "@rudel/api-routes";

export function computeIngestContentHash(input: IngestSessionInput): string {
	const hash = createHash("sha256");

	updateNamedField(hash, "source", input.source);
	updateNamedField(hash, "sessionId", input.sessionId);
	updateNamedField(hash, "projectPath", input.projectPath);
	updateNamedField(hash, "gitRemote", input.gitRemote ?? "");
	updateNamedField(hash, "packageName", input.packageName ?? "");
	updateNamedField(hash, "packageType", input.packageType ?? "");
	updateNamedNullableField(hash, "gitBranch", input.gitBranch);
	updateNamedNullableField(hash, "gitSha", input.gitSha);
	updateNamedNullableField(hash, "tag", input.tag);
	updateNamedField(hash, "content", input.content);

	if (input.source === "claude_code") {
		const subagents = [...(input.subagents ?? [])].sort((left, right) =>
			left.agentId < right.agentId ? -1 : left.agentId > right.agentId ? 1 : 0,
		);
		updateNamedField(hash, "subagentCount", String(subagents.length));
		for (const subagent of subagents) {
			updateNamedField(hash, "subagentId", subagent.agentId);
			updateNamedField(hash, "subagentContent", subagent.content);
		}
	}

	return hash.digest("hex");
}

function updateNamedField(hash: Hash, name: string, value: string): void {
	updateFramedField(hash, name);
	updateFramedField(hash, value);
}

function updateNamedNullableField(
	hash: Hash,
	name: string,
	value: string | undefined,
): void {
	updateFramedField(hash, name);
	if (value === undefined) {
		updateFramedField(hash, "absent");
		return;
	}
	updateFramedField(hash, "present");
	updateFramedField(hash, value);
}

function updateFramedField(hash: Hash, field: string): void {
	hash.update(`${Buffer.byteLength(field, "utf8")}:`);
	hash.update(field, "utf8");
}
