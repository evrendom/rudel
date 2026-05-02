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

export interface PasswordResetEmailContent {
	subject: string;
	html: string;
	text: string;
}

export type EmailVerificationOtpType =
	| "change-email"
	| "email-verification"
	| "forget-password"
	| "sign-in";

export interface EmailVerificationOtpEmailContent {
	subject: string;
	html: string;
	text: string;
}

export interface WrappedDesktopResumeEmailContent {
	subject: string;
	html: string;
	text: string;
}

export function getResendConfigWarnings(config: ResendConfig): string[] {
	if (!config.apiKey || config.fromEmail) {
		return [];
	}

	return ["Resend emails are disabled because RESEND_FROM_EMAIL is not set."];
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

export function buildPasswordResetEmailContent(
	resetUrl: string,
): PasswordResetEmailContent {
	const safeUrl = normalizeText(resetUrl);

	return {
		subject: "Reset your Rudel password",
		html: `
<p>We received a request to reset your Rudel password.</p>
<p>
  <a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
    Reset Password
  </a>
</p>
<p>Or copy this link into your browser:</p>
<p>${escapeHtml(safeUrl)}</p>
`,
		text: `We received a request to reset your Rudel password.\n\nReset your password here: ${safeUrl}`,
	};
}

function getEmailVerificationOtpSubject(type: EmailVerificationOtpType) {
	if (type === "change-email") {
		return "Verify your new Rudel email";
	}

	if (type === "forget-password") {
		return "Reset your Rudel password";
	}

	if (type === "email-verification") {
		return "Verify your Rudel email";
	}

	return "Your Rudel sign-in code";
}

export function buildEmailVerificationOtpEmailContent(data: {
	otp: string;
	type: EmailVerificationOtpType;
}): EmailVerificationOtpEmailContent {
	const safeOtp = normalizeText(data.otp);
	const subject = getEmailVerificationOtpSubject(data.type);

	return {
		subject,
		html: `
<p>Your Rudel code is:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700;">${escapeHtml(safeOtp)}</p>
<p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>
`,
		text: `Your Rudel code is: ${safeOtp}\n\nThis code expires in 5 minutes. If you did not request it, you can ignore this email.`,
	};
}

// Wrapped desktop resume links are intentionally separate from auth emails.
// This email exists for one narrow product moment only:
// a signed-in mobile user reached setup, but uploads must continue on desktop.
export function buildWrappedDesktopResumeLink(
	frontendURL: string,
	token: string,
): string {
	const trimmedFrontendURL = frontendURL.replace(/\/+$/, "");
	return `${trimmedFrontendURL}/resume/${token}`;
}

export function buildWrappedDesktopResumeEmailContent(
	resumeUrl: string,
): WrappedDesktopResumeEmailContent {
	const safeUrl = normalizeText(resumeUrl);

	return {
		subject: "Continue your Rudel setup on desktop",
		html: `
<p>You can keep viewing Rudel Wrapped on your phone, but uploading sessions still needs desktop.</p>
<p>
  <a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
    Continue on Desktop
  </a>
</p>
<p>Or copy this link into your browser on your desktop:</p>
<p>${escapeHtml(safeUrl)}</p>
`,
		text: `You can keep viewing Rudel Wrapped on your phone, but uploading sessions still needs desktop.\n\nContinue on desktop here: ${safeUrl}`,
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

export async function sendPasswordResetEmail(
	config: ResendConfig,
	data: { email: string; resetUrl: string },
): Promise<void> {
	if (!config.apiKey || !config.fromEmail) {
		return;
	}

	const message = buildPasswordResetEmailContent(data.resetUrl);

	try {
		const resend = new Resend(config.apiKey);
		await resend.emails.send({
			from: config.fromEmail,
			to: data.email,
			subject: message.subject,
			html: message.html,
			text: message.text,
		});
		logger.info("Password reset email sent to {email}", {
			email: data.email,
		});
	} catch (err) {
		logger.error("Failed to send password reset email to {email}: {error}", {
			email: data.email,
			error: err,
		});
	}
}

export async function sendEmailVerificationOtpEmail(
	config: ResendConfig,
	data: {
		email: string;
		otp: string;
		type: EmailVerificationOtpType;
	},
): Promise<boolean> {
	if (!config.apiKey || !config.fromEmail) {
		return false;
	}

	const message = buildEmailVerificationOtpEmailContent({
		otp: data.otp,
		type: data.type,
	});

	try {
		const resend = new Resend(config.apiKey);
		await resend.emails.send({
			from: config.fromEmail,
			to: data.email,
			subject: message.subject,
			html: message.html,
			text: message.text,
		});
		logger.info("Email verification code sent to {email}", {
			email: data.email,
		});
		return true;
	} catch (err) {
		logger.error("Failed to send email verification code to {email}: {error}", {
			email: data.email,
			error: err,
		});
		return false;
	}
}

// The resume-link email is best-effort. The UI still receives the direct link
// so product is not blocked on email deliverability or Resend configuration.
export async function sendWrappedDesktopResumeEmail(
	config: ResendConfig,
	data: { email: string; resumeUrl: string },
): Promise<boolean> {
	if (!config.apiKey || !config.fromEmail) {
		return false;
	}

	const message = buildWrappedDesktopResumeEmailContent(data.resumeUrl);

	try {
		const resend = new Resend(config.apiKey);
		await resend.emails.send({
			from: config.fromEmail,
			to: data.email,
			subject: message.subject,
			html: message.html,
			text: message.text,
		});
		logger.info("Wrapped desktop resume email sent to {email}", {
			email: data.email,
		});
		return true;
	} catch (err) {
		logger.error(
			"Failed to send wrapped desktop resume email to {email}: {error}",
			{
				email: data.email,
				error: err,
			},
		);
		return false;
	}
}
