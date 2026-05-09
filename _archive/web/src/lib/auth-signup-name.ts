export function getInitialSignupName(email: string): string {
	const localPart = email.split("@")[0]?.trim();
	if (!localPart) {
		return "Rudel User";
	}

	const words = localPart
		.split(/[._-]+/)
		.map((word) => word.trim())
		.filter(Boolean);
	if (words.length === 0) {
		return localPart;
	}

	return words
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");
}
