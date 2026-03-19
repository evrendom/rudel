import { getLogger } from "@logtape/logtape";
import { Resend } from "resend";

const logger = getLogger(["rudel", "api", "email"]);

export interface ResendConfig {
	apiKey?: string;
	audienceId?: string;
	fromEmail?: string;
}

export interface InvitationEmailData {
	frontendURL: string;
	invitationId: string;
	inviteeEmail: string;
	inviterName: string;
	organizationName: string;
}

export interface InvitationEmailContent {
	inviteLink: string;
	subject: string;
	html: string;
	text: string;
}

export function getResendConfigWarnings(config: ResendConfig): string[] {
	if (!config.apiKey || config.fromEmail) {
		return [];
	}

	return [
		"Resend invitation emails are disabled because RESEND_FROM_EMAIL is not set.",
	];
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function normalizeText(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim();
}

function splitName(name: string) {
	const [firstName = "", ...rest] = normalizeText(name)
		.split(/\s+/)
		.filter(Boolean);

	return {
		firstName: firstName || undefined,
		lastName: rest.join(" ") || undefined,
	};
}

export function buildInvitationLink(
	frontendURL: string,
	invitationId: string,
): string {
	const trimmedFrontendURL = frontendURL.replace(/\/+$/, "");
	return `${trimmedFrontendURL}/invitation/${invitationId}`;
}

export function buildInvitationEmailContent(
	data: InvitationEmailData,
): InvitationEmailContent {
	const inviterName = normalizeText(data.inviterName);
	const organizationName = normalizeText(data.organizationName);
	const inviteLink = buildInvitationLink(data.frontendURL, data.invitationId);

	return {
		inviteLink,
		subject: `${inviterName} invited you to ${organizationName} on Rudel`,
		html: `
<p>Hi,</p>
<p><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${escapeHtml(organizationName)}</strong> on Rudel.</p>
<p>
  <a href="${escapeHtml(inviteLink)}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
    Accept Invitation
  </a>
</p>
<p>Or copy this link into your browser:</p>
<p>${escapeHtml(inviteLink)}</p>
`,
		text: `${inviterName} invited you to join ${organizationName} on Rudel.\n\nAccept the invitation here: ${inviteLink}`,
	};
}

export async function syncSignupContact(
	config: ResendConfig,
	user: { email: string; name: string },
): Promise<void> {
	if (!config.apiKey || !config.audienceId) {
		return;
	}

	const name = splitName(user.name);

	try {
		const resend = new Resend(config.apiKey);
		await resend.contacts.create({
			audienceId: config.audienceId,
			email: user.email,
			firstName: name.firstName,
			lastName: name.lastName,
		});
	} catch (err) {
		logger.error("Failed to add Resend contact for {email}: {error}", {
			email: user.email,
			error: err,
		});
	}
}

export async function sendOrganizationInvitationEmail(
	config: ResendConfig,
	data: InvitationEmailData,
): Promise<void> {
	if (!config.apiKey || !config.fromEmail) {
		return;
	}

	const message = buildInvitationEmailContent(data);

	try {
		const resend = new Resend(config.apiKey);
		await resend.emails.send({
			from: config.fromEmail,
			to: data.inviteeEmail,
			subject: message.subject,
			html: message.html,
			text: message.text,
		});
		logger.info("Invitation email sent to {email}", {
			email: data.inviteeEmail,
		});
	} catch (err) {
		logger.error("Failed to send invitation email to {email}: {error}", {
			email: data.inviteeEmail,
			error: err,
		});
	}
}
