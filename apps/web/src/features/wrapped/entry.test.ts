import { beforeEach, describe, expect, it } from "vitest";
import type { AppSession } from "@/features/auth/auth-route-utils";
import {
	clearWrappedCompleted,
	getWrappedCompletionStorageKey,
	hasCompletedWrapped,
	isWrappedLaunchEligible,
	markWrappedCompleted,
} from "@/features/wrapped/entry";

const olderSession = createSession(new Date("2026-04-10T15:00:00.000Z"));
const newerSession = createSession(new Date("2026-04-21T09:00:00.000Z"));

describe("entry", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("treats users created before the launch cutoff as ineligible", () => {
		expect(isWrappedLaunchEligible(olderSession)).toBe(false);
	});

	it("treats users created after the launch cutoff as eligible", () => {
		expect(isWrappedLaunchEligible(newerSession)).toBe(true);
	});

	it("stores the completion flag in a versioned localStorage key", () => {
		const userId = "user-1";

		expect(hasCompletedWrapped(userId)).toBe(false);

		markWrappedCompleted(userId);

		expect(hasCompletedWrapped(userId)).toBe(true);
		expect(
			window.localStorage.getItem(getWrappedCompletionStorageKey(userId)!),
		).toBe("true");

		clearWrappedCompleted(userId);

		expect(hasCompletedWrapped(userId)).toBe(false);
	});

	it("reads and clears the legacy walk-in completion key", () => {
		const userId = "user-1";
		const legacyStorageKey = `walk-in:completed:v1:${userId}`;

		window.localStorage.setItem(legacyStorageKey, "true");

		expect(hasCompletedWrapped(userId)).toBe(true);

		clearWrappedCompleted(userId);

		expect(window.localStorage.getItem(legacyStorageKey)).toBeNull();
		expect(hasCompletedWrapped(userId)).toBe(false);
	});
});

function createSession(createdAt: Date): NonNullable<AppSession> {
	return {
		session: {
			id: "session-1",
			token: "token-1",
			userId: "user-1",
			createdAt,
			updatedAt: createdAt,
			expiresAt: createdAt,
		},
		user: {
			id: "user-1",
			email: "ada@example.com",
			name: "Ada Lovelace",
			emailVerified: true,
			image: null,
			createdAt,
			updatedAt: createdAt,
		},
	};
}
