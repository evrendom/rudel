import { describe, expect, test } from "bun:test";
import { contract } from "../index.js";

describe("team invite contract", () => {
	test("uses explicit lifecycle operations", () => {
		expect("create" in contract.teamInviteLink).toBe(true);
		expect("get" in contract.teamInviteLink).toBe(false);
		expect("revoke" in contract.teamInviteLink).toBe(true);
	});
});
