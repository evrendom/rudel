import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { notifyAccountDeletion } from "../slack.js";

const originalFetch = globalThis.fetch;

interface CapturedRequest {
	url: string;
	body: { text: string };
}

let captured: CapturedRequest[] = [];

const fetchMock = mock(
	async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const url =
			typeof input === "string" || input instanceof URL
				? String(input)
				: input.url;
		captured.push({
			url,
			body: JSON.parse((init?.body as string) ?? "{}"),
		});
		return new Response(null, { status: 200 });
	},
);

beforeEach(() => {
	captured = [];
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	fetchMock.mockClear();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("notifyAccountDeletion", () => {
	test("posts user id and org ids to webhook", async () => {
		await notifyAccountDeletion(
			"https://hooks.slack.com/services/test",
			{ id: "user-abc", name: "Sample User", email: "sample@example.com" },
			["org-1", "org-2"],
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.url).toBe("https://hooks.slack.com/services/test");
		const text = captured[0]?.body.text ?? "";
		expect(text).toContain("Account deleted");
		expect(text).toContain("`user-abc`");
		expect(text).toContain("Sample User");
		expect(text).toContain("sample@example.com");
		expect(text).toContain("`org-1`");
		expect(text).toContain("`org-2`");
		expect(text).not.toContain("manual cleanup");
	});

	test("renders empty org list with explicit placeholder", async () => {
		await notifyAccountDeletion(
			"https://hooks.slack.com/services/test",
			{ id: "user-no-orgs", name: "Solo", email: "solo@example.com" },
			[],
		);

		const text = captured[0]?.body.text ?? "";
		expect(text).toContain("`user-no-orgs`");
		expect(text).toContain("(none — user had no sole-member orgs)");
	});

	test("swallows fetch errors and does not throw", async () => {
		globalThis.fetch = (() => {
			throw new Error("network down");
		}) as unknown as typeof fetch;

		await expect(
			notifyAccountDeletion(
				"https://hooks.slack.com/services/test",
				{ id: "user-x", name: "x", email: "x@example.com" },
				[],
			),
		).resolves.toBeUndefined();
	});
});
