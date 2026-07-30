export function resolveWrappedShareLookupSource(input: {
	flyClientIp: string | null;
	forwardedFor: string | null;
	socketIp: string | null;
	trustedProxyHops: number;
}): string {
	const flyClientIp = input.flyClientIp?.trim() || null;
	const socketIp = input.socketIp?.trim() || null;
	const peerIp = flyClientIp ?? socketIp;
	if (!peerIp) {
		return "unknown";
	}

	const forwardedIps =
		input.forwardedFor
			?.split(",")
			.map((ip) => ip.trim())
			.filter(Boolean) ?? [];

	if (flyClientIp && forwardedIps.length > 0) {
		// Fly appends the app's public IP to X-Forwarded-For. Replace it with
		// Fly-Client-IP so the remaining chain matches a conventional proxy chain.
		forwardedIps.pop();
	}

	if (forwardedIps.at(-1) !== peerIp) {
		forwardedIps.push(peerIp);
	}

	const sourceIndex = forwardedIps.length - input.trustedProxyHops - 1;
	return forwardedIps[sourceIndex] ?? peerIp;
}
