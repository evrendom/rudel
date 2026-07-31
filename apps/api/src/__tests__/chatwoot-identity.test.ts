import { describe, expect, test } from "bun:test";
import { createChatwootIdentity } from "../services/chatwoot-identity.service.js";

const TEST_SECRET = "chatwoot-identity-test-secret";

describe("createChatwootIdentity", () => {
	test("creates Chatwoot's HMAC-SHA256 hex contract", () => {
		expect(
			createChatwootIdentity({
				identifier: "user-123",
				secret: TEST_SECRET,
			}),
		).toEqual({
			identifier: "user-123",
			identifier_hash:
				"c53147a74b24d6d8856f5c02f622643a7a90bbcfb001dd76f9b0a4c45ab6a8e9",
		});
	});

	test("binds the hash to the exact current-user identifier", () => {
		const currentIdentity = createChatwootIdentity({
			identifier: "current-user",
			secret: TEST_SECRET,
		});
		const alteredIdentity = createChatwootIdentity({
			identifier: "current-user-altered",
			secret: TEST_SECRET,
		});
		const siblingIdentity = createChatwootIdentity({
			identifier: "sibling-user",
			secret: TEST_SECRET,
		});

		expect(currentIdentity?.identifier_hash).not.toBe(
			alteredIdentity?.identifier_hash,
		);
		expect(currentIdentity?.identifier_hash).not.toBe(
			siblingIdentity?.identifier_hash,
		);
	});

	test("returns no identity when server signing is not configured", () => {
		for (const secret of [undefined, "", "   "]) {
			expect(
				createChatwootIdentity({
					identifier: "user-123",
					secret,
				}),
			).toBeNull();
		}
	});
});
