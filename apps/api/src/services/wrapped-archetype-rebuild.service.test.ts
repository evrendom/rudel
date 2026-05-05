import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ClickHouseStatement } from "../clickhouse.js";

const executeCalls: ClickHouseStatement[] = [];
const execute = mock((statement: ClickHouseStatement) => {
	executeCalls.push(statement);
	return Promise.resolve();
});

mock.module("../clickhouse.js", () => ({
	getClickhouse: () => ({
		execute,
		insert: mock(() => Promise.resolve()),
		query: mock(() => Promise.resolve([])),
	}),
}));

const { runWrappedArchetypeSnapshotRebuild } = await import(
	"./wrapped-archetype-rebuild.service.js"
);

describe("wrapped archetype rebuild service", () => {
	beforeEach(() => {
		execute.mockClear();
		executeCalls.length = 0;
	});

	test("inserts a snapshot before publishing the successful run row", async () => {
		await runWrappedArchetypeSnapshotRebuild({
			triggerReason: "wrapped_processing_gate",
			triggerSessionId: null,
			triggerSource: "wrapped_v1",
		});

		expect(executeCalls).toHaveLength(2);
		expect(executeCalls[0]?.query).toContain(
			"INSERT INTO rudel.wrapped_user_archetype_snapshots_v1",
		);
		expect(executeCalls[1]?.query).toContain(
			"INSERT INTO rudel.wrapped_user_archetype_runs_v1",
		);
		expect(executeCalls[1]?.query).toContain(
			"'wrapped_processing_gate' AS trigger_reason",
		);
		expect(executeCalls[1]?.query).toContain("'wrapped_v1' AS trigger_source");
	});
});
