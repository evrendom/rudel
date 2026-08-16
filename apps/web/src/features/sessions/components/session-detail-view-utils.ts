import { FolderGit2, GitBranch, type LucideIcon } from "lucide-react";
import { parseConversations } from "@/lib/conversation-schema";
import { SessionDetailFastResponseError } from "./session-detail-fast-response";
import {
	hasSessionDetailErrorCode,
	isSessionDetailResponseError,
	isSessionDetailTimeoutError,
} from "./session-detail-response";

export function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return fallback;
}

export function toStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

export function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function toContentString(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value === null || value === undefined) {
		return "";
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "";
	}
}

export function toSubagentMap(value: unknown): Record<string, string> {
	if (Array.isArray(value)) {
		return Object.fromEntries(
			value.filter(
				(item): item is [string, string] =>
					Array.isArray(item) &&
					item.length >= 2 &&
					typeof item[0] === "string" &&
					typeof item[1] === "string",
			),
		);
	}

	if (!value || typeof value !== "object") {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).filter(
			([key, entryValue]) =>
				typeof key === "string" && typeof entryValue === "string",
		),
	);
}

export function isForbiddenError(value: unknown) {
	return hasSessionDetailErrorCode(value, "FORBIDDEN");
}

export function getSessionDetailErrorState(value: unknown) {
	if (!value) {
		return undefined;
	}

	if (isForbiddenError(value)) {
		return {
			description: "You can only view your own session transcripts.",
			title: "Access Denied",
		};
	}

	if (hasSessionDetailErrorCode(value, "NOT_FOUND")) {
		return {
			description: undefined,
			title: "Session Not Found",
		};
	}

	if (isSessionDetailTimeoutError(value)) {
		return {
			description:
				"The server did not respond in time. Check the API and try again.",
			title: "Session Request Timed Out",
		};
	}

	if (
		isSessionDetailResponseError(value) ||
		value instanceof SessionDetailFastResponseError
	) {
		return {
			description:
				"The server returned session data in an unsupported format. Try again or check the deployment versions.",
			title: "Unexpected Session Data",
		};
	}

	return {
		description: "The session could not be loaded. Please try again.",
		title: "Unable to Load Session",
	};
}

export function canRetrySessionDetailError(value: unknown) {
	return (
		Boolean(value) &&
		!isForbiddenError(value) &&
		!hasSessionDetailErrorCode(value, "NOT_FOUND")
	);
}

export function getConversationSummary(content: string) {
	if (content.trim() === "") {
		return null;
	}

	try {
		const parsed = parseConversations(content);
		if (parsed.length === 0) {
			return null;
		}

		const summary = {
			totalMessages: 0,
			userMessages: 0,
			assistantMessages: 0,
			systemMessages: 0,
		};

		for (const entry of parsed) {
			if (entry.type === "user") {
				summary.userMessages += 1;
				summary.totalMessages += 1;
				continue;
			}

			if (entry.type === "assistant") {
				summary.assistantMessages += 1;
				summary.totalMessages += 1;
				continue;
			}

			if (entry.type === "system") {
				summary.systemMessages += 1;
				summary.totalMessages += 1;
			}
		}

		return summary;
	} catch {
		return null;
	}
}

export function shortenLabelFromLeft(label: string, maxLength: number) {
	if (label.length <= maxLength) {
		return label;
	}

	const slashSegments = label.split("/").filter(Boolean);
	const trailingPair = slashSegments.slice(-2).join("/");

	if (trailingPair.length > 0 && trailingPair.length + 4 <= maxLength) {
		return `.../${trailingPair}`;
	}

	const trailingSegment = slashSegments.at(-1);

	if (trailingSegment && trailingSegment.length + 4 <= maxLength) {
		return `.../${trailingSegment}`;
	}

	return `...${label.slice(-(maxLength - 3))}`;
}

type SessionMetadataBadge = {
	displayLabel: string;
	icon: LucideIcon;
	label: string;
	tooltip: string;
};

export function createSessionMetadataBadges({
	gitBranch,
	repository,
}: {
	gitBranch: string | null;
	repository: string | null;
}): SessionMetadataBadge[] {
	const metadataBadges: SessionMetadataBadge[] = [];

	if (repository) {
		metadataBadges.push({
			displayLabel: shortenLabelFromLeft(repository, 30),
			icon: FolderGit2,
			label: repository,
			tooltip: "Repository",
		});
	}

	if (gitBranch) {
		metadataBadges.push({
			displayLabel: shortenLabelFromLeft(gitBranch, 26),
			icon: GitBranch,
			label: gitBranch,
			tooltip: "Branch",
		});
	}

	return metadataBadges;
}
