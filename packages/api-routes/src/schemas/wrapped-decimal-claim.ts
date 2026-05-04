import { z } from "zod";

// Raw claim tokens are 32 random bytes encoded as base64url with a `wct_`
// prefix for human disambiguation. The DB only stores sha256(token); the raw
// token never leaves the generation script except in the URL the recipient
// receives.
export const WrappedDecimalClaimTokenSchema = z
	.string()
	.trim()
	.min(8)
	.max(64)
	.regex(/^wct_[A-Za-z0-9_-]+$/u);

// The redeem input deliberately accepts any short string. Format validation
// happens inside the service so malformed tokens fall into the same product
// result as unknown tokens (`invalid_or_used`) — the frontend can show one
// fallback path instead of branching on contract errors.
export const RedeemWrappedDecimalClaimInputSchema = z.object({
	token: z.string().trim().min(1).max(128),
});

// Three explicit outcomes:
// - granted: this call claimed the token and the caller is now entitled.
// - already_entitled: caller already has an entitlement (their own claim or a
//   prior redeem in another tab). The frontend treats this the same as granted.
// - invalid_or_used: token is unknown, malformed, or already claimed by someone
//   else. Surfaced as a clear fallback without leaking which case it was.
export const RedeemWrappedDecimalClaimResultSchema = z.discriminatedUnion(
	"status",
	[
		z.object({ status: z.literal("granted") }),
		z.object({ status: z.literal("already_entitled") }),
		z.object({ status: z.literal("invalid_or_used") }),
	],
);

export const WrappedDecimalClaimEntitlementSchema = z.object({
	entitled: z.boolean(),
});

export type WrappedDecimalClaimToken = z.infer<
	typeof WrappedDecimalClaimTokenSchema
>;
export type RedeemWrappedDecimalClaimInput = z.infer<
	typeof RedeemWrappedDecimalClaimInputSchema
>;
export type RedeemWrappedDecimalClaimResult = z.infer<
	typeof RedeemWrappedDecimalClaimResultSchema
>;
export type WrappedDecimalClaimEntitlement = z.infer<
	typeof WrappedDecimalClaimEntitlementSchema
>;
