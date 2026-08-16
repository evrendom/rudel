type ModelBadgeTone = {
	chipClassName: string;
	icon: "claude" | "codex" | null;
	identityIconClassName: string;
};

function normalizeModelVersion(version: string | null | undefined) {
	if (!version) {
		return null;
	}

	return version
		.replaceAll(/[-_]/g, ".")
		.replaceAll(/\.+/g, ".")
		.replaceAll(/^\./g, "")
		.replaceAll(/\.$/g, "");
}

function formatFallbackModelLabel(model: string) {
	return model
		.replaceAll(/[-_]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim()
		.replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

export function formatModelDisplayLabel(model: string) {
	const normalizedModel = model.trim().toLowerCase();
	const claudeFamilyMatch = normalizedModel.match(/(opus|sonnet|haiku)/);

	if (claudeFamilyMatch) {
		const familyLabel =
			claudeFamilyMatch[1][0]?.toUpperCase() +
			(claudeFamilyMatch[1].slice(1) ?? "");
		const versionAfterFamily = normalizedModel.match(
			/(?:opus|sonnet|haiku)[-_ ]?([0-9]+(?:[._-][0-9]+)?)/,
		)?.[1];
		const versionBeforeFamily = normalizedModel.match(
			/claude[-_ ]?([0-9]+(?:[._-][0-9]+)?(?:[-_][0-9]+(?:\.[0-9]+)?)?)[-_ ]?(?:opus|sonnet|haiku)/,
		)?.[1];
		const version =
			normalizeModelVersion(versionAfterFamily) ??
			normalizeModelVersion(versionBeforeFamily);

		return version ? `${familyLabel} ${version}` : familyLabel;
	}

	if (
		normalizedModel.includes("gpt") ||
		normalizedModel.includes("chatgpt") ||
		normalizedModel.includes("codex")
	) {
		const version = normalizeModelVersion(
			normalizedModel.match(/gpt[-_ ]?([0-9]+(?:[._-][0-9]+)?)/)?.[1] ??
				normalizedModel.match(
					/(?:chatgpt|codex)[-_ ]?([0-9]+(?:[._-][0-9]+)?)/,
				)?.[1],
		);

		return version ? `GPT ${version}` : "GPT";
	}

	return formatFallbackModelLabel(model);
}

export function getModelBadgeTone(model: string): ModelBadgeTone {
	const normalizedModel = model.toLowerCase();

	if (normalizedModel.includes("claude")) {
		return {
			chipClassName:
				"border-transparent bg-[#CC7D5E] text-[#F9F9F7] shadow-none",
			icon: "claude",
			identityIconClassName: "text-[#CC7D5E]",
		};
	}

	if (normalizedModel.includes("codex")) {
		return {
			chipClassName: "border-black/10 bg-[#FFFFFF] text-[#111111] shadow-none",
			icon: "codex",
			identityIconClassName: "text-[#111111] dark:text-white",
		};
	}

	if (normalizedModel.includes("chatgpt") || normalizedModel.includes("gpt")) {
		return {
			chipClassName: "border-black/10 bg-[#FFFFFF] text-[#111111] shadow-none",
			icon: "codex",
			identityIconClassName: "text-[#111111] dark:text-white",
		};
	}

	return {
		chipClassName:
			"border-[color:var(--dashboardy-chip-border)] bg-[color:var(--dashboardy-chip-surface)] text-[color:var(--dashboardy-chip-foreground)]",
		icon: null,
		identityIconClassName: "",
	};
}

export function getModelIdentityIconClassName(model: string | undefined) {
	return model ? getModelBadgeTone(model).identityIconClassName : "";
}

export function getModelBrandIconClassName(model: string | undefined) {
	if (!model) {
		return "";
	}

	const badgeTone = getModelBadgeTone(model);
	return badgeTone.icon === "codex"
		? "text-[#111111]"
		: badgeTone.identityIconClassName;
}
