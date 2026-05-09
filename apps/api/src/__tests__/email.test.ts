import { describe, expect, test } from "bun:test";
import {
	buildEmailVerificationOtpEmailContent,
	buildInvitationEmailContent,
	buildInvitationLink,
	buildWrappedDesktopResumeLink,
	getResendConfigWarnings,
	sendEmailVerificationOtpEmail,
	sendOrganizationInvitationEmail,
	syncSignupContact,
} from "../email.js";

const invitation = {
	frontendURL: "http://localhost:5173/",
	invitationId: "invite_123",
	inviteeEmail: "person@example.com",
	inviterName: 'Alice <script>alert("x")</script>\nDoe',
	organizationName: 'Team & "Co"',
};

describe("email helpers", () => {
	test("buildInvitationLink trims trailing slashes", () => {
		expect(buildInvitationLink("http://localhost:5173/", "invite_123")).toBe(
			"http://localhost:5173/invitation/invite_123",
		);
	});

	test("buildWrappedDesktopResumeLink trims trailing slashes", () => {
		expect(
			buildWrappedDesktopResumeLink(
				"http://localhost:5173/",
				"123e4567-e89b-12d3-a456-426614174000",
			),
		).toBe("http://localhost:5173/resume/123e4567-e89b-12d3-a456-426614174000");
	});

	test("buildInvitationEmailContent escapes user-controlled HTML", () => {
		const message = buildInvitationEmailContent(invitation);

		expect(message.inviteLink).toBe(
			"http://localhost:5173/invitation/invite_123",
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

	test("getResendConfigWarnings warns when sender is missing", () => {
		expect(getResendConfigWarnings({ apiKey: "test-key" })).toEqual([
			"Resend emails are disabled because RESEND_FROM_EMAIL is not set.",
		]);
		expect(
			getResendConfigWarnings({
				apiKey: "test-key",
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
