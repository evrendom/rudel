import { randomUUID } from "node:crypto";
import { getLogger } from "@logtape/logtape";
import {
	buildWrappedArchetypeRunInsertSql,
	buildWrappedArchetypeSnapshotInsertSql,
	type WrappedArchetypeRebuildTriggerReason,
} from "@rudel/ch-schema/wrapped-archetype-rebuild";
import { getClickhouse } from "../clickhouse.js";

interface WrappedArchetypeSnapshotRebuildTrigger {
	triggerReason: WrappedArchetypeRebuildTriggerReason;
	triggerSessionId: string | null;
	triggerSource: string | null;
}

const logger = getLogger(["rudel", "api", "wrapped-archetype-rebuild"]);
const PROCESSING_GATE_REBUILD_COOLDOWN_MS = 15_000;

let isRebuildRunning = false;
let queuedTrigger: WrappedArchetypeSnapshotRebuildTrigger | null = null;
let lastProcessingGateQueuedAt = 0;

export function enqueueWrappedArchetypeSnapshotRebuild(
	trigger: WrappedArchetypeSnapshotRebuildTrigger,
): void {
	if (isProcessingGateCoolingDown(trigger)) {
		return;
	}

	queuedTrigger = trigger;
	if (isRebuildRunning) {
		return;
	}

	isRebuildRunning = true;
	void drainWrappedArchetypeSnapshotRebuildQueue().catch((error) => {
		isRebuildRunning = false;
		logger.error("Wrapped archetype rebuild queue crashed: {error}", {
			error,
		});
	});
}

export async function runWrappedArchetypeSnapshotRebuild(
	trigger: WrappedArchetypeSnapshotRebuildTrigger,
): Promise<void> {
	const snapshotId = randomUUID();
	const snapshotCreatedAt = formatClickhouseDateTime(new Date());
	const clickhouse = getClickhouse();

	logger.info("Starting wrapped archetype rebuild ({triggerReason})", {
		triggerReason: trigger.triggerReason,
	});

	await clickhouse.execute({
		query: buildWrappedArchetypeSnapshotInsertSql({
			snapshotCreatedAt,
			snapshotId,
		}),
	});

	await clickhouse.execute({
		query: buildWrappedArchetypeRunInsertSql({
			snapshotCreatedAt,
			snapshotId,
			triggerReason: trigger.triggerReason,
			triggerSessionId: trigger.triggerSessionId,
			triggerSource: trigger.triggerSource,
		}),
	});

	logger.info(
		"Published wrapped archetype rebuild snapshot {snapshotId} ({triggerReason})",
		{
			snapshotId,
			triggerReason: trigger.triggerReason,
		},
	);
}

async function drainWrappedArchetypeSnapshotRebuildQueue(): Promise<void> {
	while (queuedTrigger !== null) {
		const trigger = queuedTrigger;
		queuedTrigger = null;

		try {
			await runWrappedArchetypeSnapshotRebuild(trigger);
		} catch (error) {
			logger.error("Wrapped archetype rebuild failed: {error}", {
				error,
			});
		}
	}

	isRebuildRunning = false;
}

function isProcessingGateCoolingDown(
	trigger: WrappedArchetypeSnapshotRebuildTrigger,
): boolean {
	if (trigger.triggerReason !== "wrapped_processing_gate") {
		return false;
	}

	const now = Date.now();
	if (now - lastProcessingGateQueuedAt < PROCESSING_GATE_REBUILD_COOLDOWN_MS) {
		return true;
	}

	lastProcessingGateQueuedAt = now;
	return false;
}

function formatClickhouseDateTime(date: Date): string {
	return date.toISOString().replace("T", " ").replace("Z", "");
}
