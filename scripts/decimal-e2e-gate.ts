#!/usr/bin/env bun
// One-off end-to-end gate against a real Postgres. Exercises the full Decimal
// flow at the service layer: entitlement claim → wrappedShare.create with
// variant=decimal → wrappedShare.getPublic. Cleans up after itself.
//
// Run with: doppler run --project rudel --config ci -- bun run scripts/decimal-e2e-gate.ts

import { createHash, randomBytes } from "node:crypto";
import type { WrappedShareSnapshot } from "@rudel/api-routes";
import { sqlClient } from "../apps/api/src/db.js";
import {
	createWrappedShare,
	getPublicWrappedShare,
} from "../apps/api/src/services/wrapped-share.service.js";

const TEST_TAG = `e2e-decimal-${Date.now()}`;
const userId = `${TEST_TAG}-user`;
const orgId = `${TEST_TAG}-org`;

function snapshot(input: {
	displayName: string;
	archetypeLabel: string;
	shellClassName: string;
}): WrappedShareSnapshot {
	return {
		archetypeLabel: input.archetypeLabel,
		row: {
			activeDays: 6,
			cost: 42,
			displayName: input.displayName,
			favoriteModel: "claude-sonnet-4-6",
			hasActivity: true,
			imageUrl: null,
			inputTokens: 120,
			lastActiveDate: "2026-04-22",
			outputTokens: 240,
			role: "Builder",
			totalSessions: 12,
			totalTokens: 360,
		},
		shellClassName: input.shellClassName,
		statItems: [],
		theme: "light",
	};
}

function fail(message: string): never {
	console.error(`✗ ${message}`);
	process.exit(1);
}

async function setup(): Promise<void> {
	await sqlClient`
		INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES (${userId}, 'E2E Decimal', ${`${TEST_TAG}@example.test`}, true, NOW(), NOW())
	`;
	await sqlClient`
		INSERT INTO organization (id, name, slug, created_at)
		VALUES (${orgId}, ${TEST_TAG}, ${TEST_TAG}, NOW())
	`;
	await sqlClient`
		INSERT INTO member (id, organization_id, user_id, role, created_at)
		VALUES (${`${TEST_TAG}-mem`}, ${orgId}, ${userId}, 'owner', NOW())
	`;
}

async function teardown(): Promise<void> {
	await sqlClient`DELETE FROM wrapped_decimal_claim WHERE claimed_by_user_id = ${userId}`;
	await sqlClient`DELETE FROM wrapped_share WHERE user_id = ${userId}`;
	await sqlClient`DELETE FROM member WHERE user_id = ${userId}`;
	await sqlClient`DELETE FROM organization WHERE id = ${orgId}`;
	await sqlClient`DELETE FROM "user" WHERE id = ${userId}`;
}

async function main(): Promise<void> {
	console.log(`Test user: ${userId}`);
	await setup();

	// --- Gate 3a: Decimal create rejected without entitlement -------------
	let rejected = false;
	try {
		await createWrappedShare({
			organizationId: orgId,
			snapshot: snapshot({
				displayName: "Test Decimal",
				archetypeLabel: "Roadrunner",
				shellClassName:
					"bg-[linear-gradient(161.01deg,_#28D0FF_4.98%,_#FFCA0D_99.99%)]",
			}),
			userId,
			variant: "decimal",
		});
	} catch (error) {
		rejected = (error as { code?: string }).code === "FORBIDDEN";
	}
	if (!rejected) {
		fail(
			"Decimal create without entitlement should have thrown FORBIDDEN, but did not.",
		);
	}
	console.log("✓ Decimal create rejected without entitlement");

	// --- Insert a claimed entitlement row and retry -----------------------
	const tokenHash = createHash("sha256").update(randomBytes(32)).digest();
	await sqlClient`
		INSERT INTO wrapped_decimal_claim (token_hash, created_at, claimed_by_user_id, claimed_at)
		VALUES (${tokenHash}, NOW(), ${userId}, NOW())
	`;

	// --- Gate 3b/4: normal + Decimal shares coexist -----------------------
	const normalShare = await createWrappedShare({
		organizationId: orgId,
		snapshot: snapshot({
			displayName: "E2E Decimal",
			archetypeLabel: "Roadrunner",
			shellClassName:
				"bg-[linear-gradient(161.01deg,_#28D0FF_4.98%,_#FFCA0D_99.99%)]",
		}),
		userId,
		variant: "normal",
	});
	const decimalShare = await createWrappedShare({
		organizationId: orgId,
		snapshot: snapshot({
			displayName: "E2E Decimal",
			archetypeLabel: "Roadrunner",
			shellClassName:
				"bg-[linear-gradient(161.01deg,_#28D0FF_4.98%,_#FFCA0D_99.99%)]",
		}),
		userId,
		variant: "decimal",
	});

	if (normalShare.variant !== "normal") {
		fail(`Normal share variant should be 'normal', got ${normalShare.variant}`);
	}
	if (decimalShare.variant !== "decimal") {
		fail(
			`Decimal share variant should be 'decimal', got ${decimalShare.variant}`,
		);
	}
	if (!decimalShare.id.endsWith("-decimal")) {
		fail(`Decimal slug should end in '-decimal', got '${decimalShare.id}'`);
	}
	if (decimalShare.id === normalShare.id) {
		fail("Normal and Decimal shares should have distinct ids");
	}
	console.log(
		`✓ Normal share id: '${normalShare.id}', Decimal share id: '${decimalShare.id}'`,
	);

	// --- Gate 5: public read returns variant + correct snapshot -----------
	const publicNormal = await getPublicWrappedShare(normalShare.id);
	const publicDecimal = await getPublicWrappedShare(decimalShare.id);

	if (!publicNormal) fail("Normal public read returned null");
	if (!publicDecimal) fail("Decimal public read returned null");
	if (publicNormal.variant !== "normal") {
		fail(
			`Public normal variant should be 'normal', got ${publicNormal.variant}`,
		);
	}
	if (publicDecimal.variant !== "decimal") {
		fail(
			`Public decimal variant should be 'decimal', got ${publicDecimal.variant}`,
		);
	}
	if (publicDecimal.snapshot.archetypeLabel !== "Roadrunner") {
		fail(
			`Public decimal archetypeLabel should preserve the user archetype 'Roadrunner', got '${publicDecimal.snapshot.archetypeLabel}'`,
		);
	}
	if (!publicDecimal.snapshot.shellClassName.includes("28D0FF")) {
		fail(
			"Public decimal shellClassName should preserve the user archetype gradient '#28D0FF'",
		);
	}
	if (publicNormal.snapshot.archetypeLabel !== "Roadrunner") {
		fail(
			`Public normal archetypeLabel should be 'Roadrunner', got '${publicNormal.snapshot.archetypeLabel}'`,
		);
	}
	console.log(
		"✓ Public Decimal snapshot preserves the classifier archetype while the variant carries the edition",
	);
	console.log(
		"✓ Public normal snapshot is unchanged (carries the classifier archetype)",
	);

}

try {
	await main();
	console.log("\nAll E2E gates passed.");
} catch (error) {
	console.error(error);
	process.exit(1);
} finally {
	await teardown();
	await sqlClient.end();
}
