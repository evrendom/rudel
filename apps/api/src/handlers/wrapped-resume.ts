import { ORPCError } from "@orpc/server";
import {
	buildWrappedDesktopResumeLink,
	sendWrappedDesktopResumeEmail,
} from "../email.js";
import { getFrontendOrigin } from "../frontend-origin.js";
import { authMiddleware, os } from "../middleware.js";
import {
	consumeWrappedResume,
	createWrappedResume,
} from "../services/wrapped-resume.service.js";

const resendConfig = {
	apiKey: process.env.RESEND_API_KEY,
	audienceId: process.env.RESEND_AUDIENCE_ID,
	fromEmail: process.env.RESEND_FROM_EMAIL,
};

// Only an authenticated user can ask for a desktop continuation link because
// the link is tied to their account email and intended setup path.
const create = os.wrappedResume.create
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		const email = context.user.email?.trim();

		if (!email) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Signed-in user must have an email address",
			});
		}

		const resumeRecord = await createWrappedResume({
			email,
			shareId: input.shareId ?? null,
			userId: context.user.id,
		});
		const resumeUrl = buildWrappedDesktopResumeLink(
			getFrontendOrigin(),
			resumeRecord.token,
		);
		const emailSent = await sendWrappedDesktopResumeEmail(resendConfig, {
			email,
			resumeUrl,
		});

		return {
			email,
			email_sent: emailSent,
			expires_at: resumeRecord.expiresAt,
			resume_url: resumeUrl,
		};
	});

// Consuming the token also requires auth so the desktop session can be checked
// against the same email identity that requested the mobile handoff.
const consume = os.wrappedResume.consume
	.use(authMiddleware)
	.handler(async ({ context, input }) => {
		const email = context.user.email?.trim();

		if (!email) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Signed-in user must have an email address",
			});
		}

		const result = await consumeWrappedResume({
			email,
			token: input.token,
		});

		if (result.status === "missing" || result.status === "expired") {
			throw new ORPCError("NOT_FOUND", {
				message: "Desktop resume link is invalid or expired",
			});
		}

		if (result.status === "used") {
			throw new ORPCError("CONFLICT", {
				message: "Desktop resume link has already been used",
			});
		}

		if (result.status === "email_mismatch") {
			throw new ORPCError("FORBIDDEN", {
				message: "Desktop resume link belongs to another account",
			});
		}

		if (result.status !== "consumed") {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Unexpected wrapped resume state",
			});
		}

		return {
			redirect_to: result.redirectTo,
			share_id: result.shareId,
		};
	});

export const wrappedResumeRouter = os.wrappedResume.router({
	create,
	consume,
});
