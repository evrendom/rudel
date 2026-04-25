import { z } from "zod";

export const CreateWrappedResumeInputSchema = z.object({
	// shareId is optional because mobile users can also need a desktop handoff
	// from plain /wrapped, not only from a public wrapped page.
	shareId: z.string().uuid().nullable().optional(),
});

export const WrappedResumeRecordSchema = z.object({
	email: z.string().email(),
	email_sent: z.boolean(),
	expires_at: z.string(),
	resume_url: z.string().url(),
});

export const ConsumeWrappedResumeInputSchema = z.object({
	token: z.string().uuid(),
});

export const WrappedResumeConsumeResultSchema = z.object({
	redirect_to: z.string().min(1),
	share_id: z.string().uuid().nullable(),
});

export type CreateWrappedResumeInput = z.infer<
	typeof CreateWrappedResumeInputSchema
>;
export type WrappedResumeRecord = z.infer<typeof WrappedResumeRecordSchema>;
export type ConsumeWrappedResumeInput = z.infer<
	typeof ConsumeWrappedResumeInputSchema
>;
export type WrappedResumeConsumeResult = z.infer<
	typeof WrappedResumeConsumeResultSchema
>;
