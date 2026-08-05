import { createHash } from "node:crypto";
import type {
	HistoricalSkillDetail,
	HistoricalSkillVersion,
} from "@rudel/api-routes";
import { extractHistoricalCodexSkillBodies } from "./historical-codex-skill-parser.js";

export interface HistoricalSkillSessionRow {
	content: string;
	session_id: string;
	used_at: string;
}

interface MutableHistoricalSkillVersion {
	contentSha256: string;
	content: string;
	sessionIds: Set<string>;
	firstUsedAt: string;
	lastUsedAt: string;
}

export function buildHistoricalSkillDetail(
	name: string,
	rows: readonly HistoricalSkillSessionRow[],
): HistoricalSkillDetail {
	const versionsByHash = new Map<string, MutableHistoricalSkillVersion>();
	const allSessionIds = new Set<string>();
	const availableSessionIds = new Set<string>();

	for (const row of rows) {
		allSessionIds.add(row.session_id);
		const bodies = extractHistoricalCodexSkillBodies(row.content, name);
		if (bodies.length === 0) {
			continue;
		}

		availableSessionIds.add(row.session_id);
		for (const body of bodies) {
			addVersionUse(versionsByHash, body, row.session_id, row.used_at);
		}
	}

	return {
		name,
		sessionCount: allSessionIds.size,
		versions: sortHistoricalSkillVersions(
			[...versionsByHash.values()].map(toHistoricalSkillVersion),
		),
		unavailableSessionCount: allSessionIds.size - availableSessionIds.size,
	};
}

function addVersionUse(
	versionsByHash: Map<string, MutableHistoricalSkillVersion>,
	content: string,
	sessionId: string,
	usedAt: string,
): void {
	const contentSha256 = createHash("sha256")
		.update(content, "utf8")
		.digest("hex");
	const existing = versionsByHash.get(contentSha256);

	if (existing) {
		existing.sessionIds.add(sessionId);
		if (usedAt < existing.firstUsedAt) {
			existing.firstUsedAt = usedAt;
		}
		if (usedAt > existing.lastUsedAt) {
			existing.lastUsedAt = usedAt;
		}
		return;
	}

	versionsByHash.set(contentSha256, {
		contentSha256,
		content,
		sessionIds: new Set([sessionId]),
		firstUsedAt: usedAt,
		lastUsedAt: usedAt,
	});
}

function toHistoricalSkillVersion(
	version: MutableHistoricalSkillVersion,
): HistoricalSkillVersion {
	return {
		contentSha256: version.contentSha256,
		content: version.content,
		sessionCount: version.sessionIds.size,
		firstUsedAt: version.firstUsedAt,
		lastUsedAt: version.lastUsedAt,
	};
}

function sortHistoricalSkillVersions(
	versions: readonly HistoricalSkillVersion[],
): HistoricalSkillVersion[] {
	return [...versions].sort((left, right) => {
		const lastUsedComparison = right.lastUsedAt.localeCompare(left.lastUsedAt);
		if (lastUsedComparison !== 0) {
			return lastUsedComparison;
		}

		return left.contentSha256.localeCompare(right.contentSha256);
	});
}
