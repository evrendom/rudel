import { createHmac } from "node:crypto";

export function createChatwootIdentity(input: {
	identifier: string;
	secret: string | undefined;
}) {
	const secret = input.secret?.trim();
	if (!secret) {
		return null;
	}

	return {
		identifier: input.identifier,
		identifier_hash: createHmac("sha256", secret)
			.update(input.identifier)
			.digest("hex"),
	};
}
