import { describe, expect, test } from "bun:test";
import {
	buildClickHousePurgeFailureAlertContent,
	buildEmailVerificationOtpEmailContent,
	buildInvitationEmailContent,
	buildInvitationLink,
	buildWrappedDesktopResumeLink,
	getClickHousePurgeFailureAlertIdempotencyKey,
	getResendConfigWarnings,
	sendEmailVerificationOtpEmail,
	sendOrganizationInvitationEmail,
	syncSignupContact,
} from "../email.js";

const invitation = {
	frontendURL: "https://app.rudel.ai/",
	invitationId: "invite_123",
	inviteeEmail: "person@example.com",
	inviterName: 'Alice <script>alert("x")</script>\nDoe',
	organizationName: 'Team & "Co"',
};

describe("email helpers", () => {
	test("buildInvitationLink trims trailing slashes", () => {
		expect(buildInvitationLink("https://app.rudel.ai/", "invite_123")).toBe(
			"https://app.rudel.ai/invitation/invite_123",
		);
	});

	test("buildWrappedDesktopResumeLink trims trailing slashes", () => {
		expect(
			buildWrappedDesktopResumeLink(
				"https://app.rudel.ai/",
				"123e4567-e89b-12d3-a456-426614174000",
			),
		).toBe("https://app.rudel.ai/resume/123e4567-e89b-12d3-a456-426614174000");
	});

	test("buildInvitationEmailContent escapes user-controlled HTML", () => {
		const message = buildInvitationEmailContent(invitation);

		expect(message.inviteLink).toBe(
			"https://app.rudel.ai/invitation/invite_123",
		);
		expect(message.subject).toBe(
			'Alice <script>alert("x")</script> Doe invited you to Team & "Co" on Rudel',
		);
		expect(message.html).toContain(
			"Alice &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; Doe",
		);
		expect(message.html).toContain("Team &amp; &quot;Co&quot;");
		expect(message.html).not.toContain("<script>");
	});

	test("buildEmailVerificationOtpEmailContent escapes the verification code", () => {
		const message = buildEmailVerificationOtpEmailContent({
			otp: '123<45"',
			type: "sign-in",
		});

		expect(message.subject).toBe("Your Rudel sign-in code");
		expect(message.html).toContain("123&lt;45&quot;");
		expect(message.html).not.toContain('123<45"');
		expect(message.text).toContain('123<45"');
	});

	test("buildClickHousePurgeFailureAlertContent includes actionable sanitized fields", () => {
		const message = buildClickHousePurgeFailureAlertContent({
			attemptCount: 5,
			createdAt: new Date("2026-07-28T08:00:00.000Z"),
			failedAt: new Date("2026-07-28T08:15:00.000Z"),
			id: "purge-job-123",
			lastAttemptAt: new Date("2026-07-28T08:14:59.000Z"),
			lastError: "ClickHouseError: request <timed out>",
			targetId: "workspace-456",
			targetType: "organization",
		});

		expect(message.subject).toBe(
			"Rudel ClickHouse purge failed: workspace workspace-456",
		);
		expect(message.text).toContain("Attempts: 5");
		expect(message.text).toContain("2026-07-28T08:15:00.000Z");
		expect(message.html).toContain(
			"ClickHouseError: request &lt;timed out&gt;",
		);
		expect(message.html).not.toContain("request <timed out>");
	});

	test("ClickHouse purge alerts use one stable provider idempotency key", () => {
		expect(getClickHousePurgeFailureAlertIdempotencyKey("purge-job-123")).toBe(
			"clickhouse-purge-failed/purge-job-123",
		);
	});

	test("getResendConfigWarnings reports disabled email integrations", () => {
		expect(getResendConfigWarnings({ apiKey: "test-key" })).toEqual([
			"Resend emails are disabled because RESEND_FROM_EMAIL is not set.",
		]);
		expect(
			getResendConfigWarnings({
				apiKey: "test-key",
				fromEmail: "Rudel <noreply@example.com>",
			}),
		).toEqual([
			"ClickHouse purge failure alerts are disabled because CLICKHOUSE_PURGE_ALERT_RECIPIENT is not set.",
		]);
		expect(
			getResendConfigWarnings({
				apiKey: "test-key",
				clickHousePurgeAlertRecipient: "operator@example.com",
				fromEmail: "Rudel <noreply@example.com>",
			}),
		).toEqual([]);
	});

	test("sendOrganizationInvitationEmail returns early when config is incomplete", async () => {
		await expect(
			sendOrganizationInvitationEmail({}, invitation),
		).resolves.toBeUndefined();
		await expect(
			sendOrganizationInvitationEmail({ apiKey: "test-key" }, invitation),
		).resolves.toBeUndefined();
	});

	test("sendEmailVerificationOtpEmail reports failure when config is incomplete", async () => {
		await expect(
			sendEmailVerificationOtpEmail(
				{},
				{ email: "person@example.com", otp: "123456", type: "sign-in" },
			),
		).resolves.toBe(false);
		await expect(
			sendEmailVerificationOtpEmail(
				{ apiKey: "test-key" },
				{ email: "person@example.com", otp: "123456", type: "sign-in" },
			),
		).resolves.toBe(false);
	});

	test("syncSignupContact returns early when config is incomplete", async () => {
		await expect(
			syncSignupContact({}, { email: "person@example.com", name: "Alice Doe" }),
		).resolves.toBeUndefined();
		await expect(
			syncSignupContact(
				{ apiKey: "test-key" },
				{ email: "person@example.com", name: "Alice Doe" },
			),
		).resolves.toBeUndefined();
	});
});
