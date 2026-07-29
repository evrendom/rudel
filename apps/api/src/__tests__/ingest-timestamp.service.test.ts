import { describe, expect, test } from "bun:test";
import { createMonotonicIngestedAt } from "../services/ingest-timestamp.service.js";

describe("createMonotonicIngestedAt", () => {
	test("allocates distinct millisecond versions when the clock does not advance", () => {
		const getIngestedAt = createMonotonicIngestedAt(() => 1_000);

		expect([
			getIngestedAt().getTime(),
			getIngestedAt().getTime(),
			getIngestedAt().getTime(),
		]).toEqual([1_000, 1_001, 1_002]);
	});
});
