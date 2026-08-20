import { ORPCError } from "@orpc/client";
import type { ScannedProject, SessionFile } from "@rudel/agent-adapters";
import {
	CLI_SESSION_UPLOAD_STATUS_MAX_IDS,
	parseSafeApiEndpoint,
} from "@rudel/api-routes";
import pMap from "p-map";
import { createRpcClient } from "./api-client.js";
import { describeUploadEndpointRejection } from "./upload-endpoint.js";

export interface UploadProjectTarget {
	readonly organizationId: string | undefined;
	readonly project: ScannedProject;
}

export interface ResolvedOrganizationUploadStatus {
	readonly organizationId: string;
	readonly uploadedSessionIds: ReadonlySet<string>;
}

export interface ReconciledUploadProject extends UploadProjectTarget {
	readonly duplicateSessions: readonly SessionFile[];
	readonly newSessions: readonly SessionFile[];
	readonly resolvedOrganizationId: string;
	readonly uploadedSessions: readonly SessionFile[];
}

export interface UploadReconciliationConfig {
	readonly allowInsecureEndpoint: boolean;
	readonly authType: "bearer" | "api-key" | undefined;
	readonly endpoint: string;
	readonly token: string;
}

export interface UploadProjectOrder {
	readonly containsCwd: boolean;
	readonly index: number;
}

export async function reconcileUploadProjects(
	targets: readonly UploadProjectTarget[],
	config: UploadReconciliationConfig,
): Promise<ReconciledUploadProject[]> {
	const endpoint = parseSafeApiEndpoint(config.endpoint, {
		allowPlaintext: config.allowInsecureEndpoint,
	});
	if (!endpoint.ok) {
		throw new Error(
			`Upload endpoint refused: ${describeUploadEndpointRejection(endpoint)}`,
		);
	}

	const client = createRpcClient({
		rpcUrl: endpoint.url,
		token: config.token,
		authType: config.authType,
	});
	const sessionIdsByOrganization = collectSessionIdsByOrganization(targets);
	const statusEntries = await pMap(
		Array.from(sessionIdsByOrganization),
		async ([organizationId, sessionIds]) => {
			const responses = await pMap(
				chunk(sessionIds, CLI_SESSION_UPLOAD_STATUS_MAX_IDS),
				(ids) =>
					client.cli.sessionUploadStatus({
						organizationId,
						sessionIds: ids,
					}),
				{ concurrency: 4 },
			);
			const firstResponse = responses[0];
			if (!firstResponse) {
				throw new Error("Upload status response was empty");
			}
			const uploadedSessionIds = new Set<string>();
			for (const response of responses) {
				if (response.organizationId !== firstResponse.organizationId) {
					throw new Error("Upload status resolved inconsistent organizations");
				}
				for (const sessionId of response.uploadedSessionIds) {
					uploadedSessionIds.add(sessionId);
				}
			}
			return [
				organizationId,
				{
					organizationId: firstResponse.organizationId,
					uploadedSessionIds,
				},
			] as const;
		},
		{ concurrency: 4 },
	).catch((error: unknown) => {
		throw new Error(formatUploadReconciliationError(error));
	});

	return classifyUploadProjects(targets, new Map(statusEntries));
}

export function classifyUploadProjects(
	targets: readonly UploadProjectTarget[],
	statusByRequestedOrganization: ReadonlyMap<
		string | undefined,
		ResolvedOrganizationUploadStatus
	>,
): ReconciledUploadProject[] {
	const locallyClaimedByOrganization = new Map<string, Set<string>>();

	return targets.map((target) => {
		const status = statusByRequestedOrganization.get(target.organizationId);
		if (!status) {
			throw new Error("Upload status is missing for a target organization");
		}
		const locallyClaimed =
			locallyClaimedByOrganization.get(status.organizationId) ?? new Set();
		locallyClaimedByOrganization.set(status.organizationId, locallyClaimed);

		const newSessions: SessionFile[] = [];
		const uploadedSessions: SessionFile[] = [];
		const duplicateSessions: SessionFile[] = [];
		for (const session of target.project.sessions) {
			if (status.uploadedSessionIds.has(session.sessionId)) {
				uploadedSessions.push(session);
				continue;
			}
			if (locallyClaimed.has(session.sessionId)) {
				duplicateSessions.push(session);
				continue;
			}
			locallyClaimed.add(session.sessionId);
			newSessions.push(session);
		}

		return {
			...target,
			duplicateSessions,
			newSessions,
			resolvedOrganizationId: status.organizationId,
			uploadedSessions,
		};
	});
}

export function orderUploadProjectsNewFirst<
	TProject extends {
		readonly newSessions: readonly SessionFile[];
		readonly project: ScannedProject;
	},
>(
	projects: readonly TProject[],
	projectOrder: ReadonlyMap<ScannedProject, UploadProjectOrder>,
): TProject[] {
	return [...projects].sort((left, right) => {
		const leftHasNew = left.newSessions.length > 0;
		const rightHasNew = right.newSessions.length > 0;
		if (leftHasNew !== rightHasNew) return leftHasNew ? -1 : 1;
		const leftOrder = projectOrder.get(left.project);
		const rightOrder = projectOrder.get(right.project);
		if (leftOrder?.containsCwd !== rightOrder?.containsCwd) {
			return leftOrder?.containsCwd ? -1 : 1;
		}
		return (leftOrder?.index ?? 0) - (rightOrder?.index ?? 0);
	});
}

function collectSessionIdsByOrganization(
	targets: readonly UploadProjectTarget[],
): Map<string | undefined, string[]> {
	const sessionIdsByOrganization = new Map<string | undefined, Set<string>>();
	for (const target of targets) {
		const sessionIds =
			sessionIdsByOrganization.get(target.organizationId) ?? new Set<string>();
		sessionIdsByOrganization.set(target.organizationId, sessionIds);
		for (const session of target.project.sessions) {
			sessionIds.add(session.sessionId);
		}
	}

	return new Map(
		Array.from(sessionIdsByOrganization, ([organizationId, sessionIds]) => [
			organizationId,
			Array.from(sessionIds),
		]),
	);
}

function chunk<TValue>(values: readonly TValue[], maxSize: number): TValue[][] {
	const chunks: TValue[][] = [];
	for (let index = 0; index < values.length; index += maxSize) {
		chunks.push(values.slice(index, index + maxSize));
	}
	return chunks;
}

function formatUploadReconciliationError(error: unknown): string {
	if (
		error instanceof ORPCError &&
		(error.status === 401 || error.status === 403)
	) {
		return "Could not check uploaded sessions because authentication expired. Run `rudel login` and try again.";
	}
	if (error instanceof ORPCError) {
		return `Could not check uploaded sessions (${error.status} ${error.message}). No sessions were uploaded.`;
	}
	const message = error instanceof Error ? error.message : "connection failed";
	return `Could not check uploaded sessions: ${message}. No sessions were uploaded.`;
}
