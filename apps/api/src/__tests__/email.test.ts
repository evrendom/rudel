import { describe, expect, test } from "bun:test";
import {
	buildInvitationEmailContent,
	buildInvitationLink,
	getResendConfigWarnings,
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

	test("getResendConfigWarnings warns when sender is missing", () => {
		expect(getResendConfigWarnings({ apiKey: "test-key" })).toEqual([
			"Resend invitation emails are disabled because RESEND_FROM_EMAIL is not set.",
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
