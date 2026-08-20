type ModelBadgeTone = {
	chipClassName: string;
	icon: "claude" | "codex" | null;
	identityIconClassName: string;
};

const CLAUDE_FAMILY_PATTERN =
	/(?:^|[-_ ])(fable|haiku|mythos|opus|sonnet)(?:$|[-_ ])/;
const OPENAI_MODEL_PATTERN =
	/^(?:chat(?:gpt)?(?:-|$)|codex(?:-|$)|gpt(?:-|$)|o\d+(?:[-_.]|$))/;

function modelLeaf(model: string) {
	return model.trim().toLowerCase().split("/").at(-1) ?? "";
}

function capitalizeWord(word: string) {
	return word === "gpt"
		? "GPT"
		: `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
}

function formatModelSuffix(value: string) {
	return value
		.replace(/[-_]?20\d{2}[-_]\d{2}[-_]\d{2}$/u, "")
		.replace(/[-_]?latest$/u, "")
		.split(/[-_ ]+/u)
		.filter(Boolean)
		.map(capitalizeWord)
		.join(" ");
}

function isClaudeModel(model: string) {
	return model.includes("claude") || CLAUDE_FAMILY_PATTERN.test(model);
}

function isOpenAiModel(model: string) {
	return OPENAI_MODEL_PATTERN.test(model);
}

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
	const normalizedModel = modelLeaf(model);
	const claudeFamilyMatch = normalizedModel.match(CLAUDE_FAMILY_PATTERN);

	if (claudeFamilyMatch) {
		const familyLabel =
			claudeFamilyMatch[1][0]?.toUpperCase() +
			(claudeFamilyMatch[1].slice(1) ?? "");
		const versionAfterFamily = normalizedModel.match(
			/(?:fable|haiku|mythos|opus|sonnet)[-_ ]?([0-9]+(?:[._-][0-9]+)?)/,
		)?.[1];
		const versionBeforeFamily = normalizedModel.match(
			/claude[-_ ]?([0-9]+(?:[._-][0-9]+)?(?:[-_][0-9]+(?:\.[0-9]+)?)?)[-_ ]?(?:fable|haiku|mythos|opus|sonnet)/,
		)?.[1];
		const version =
			normalizeModelVersion(versionAfterFamily) ??
			normalizeModelVersion(versionBeforeFamily);

		return version ? `${familyLabel} ${version}` : familyLabel;
	}

	if (normalizedModel === "chat-latest") {
		return "Chat Latest";
	}

	if (/^o\d+(?:[-_.]|$)/u.test(normalizedModel)) {
		return normalizedModel.replaceAll(/[-_]+/gu, " ");
	}

	if (normalizedModel.startsWith("gpt-daybreak-")) {
		return `GPT ${formatModelSuffix(normalizedModel.slice(4))}`;
	}

	const gptMatch = normalizedModel.match(
		/^(?:chatgpt[-_ ]?)?gpt[-_ ]?([0-9]+(?:[._-][0-9]+)?[a-z]?)(.*)$/u,
	);
	if (gptMatch) {
		const version = normalizeModelVersion(gptMatch[1]);
		const suffix = formatModelSuffix(gptMatch[2] ?? "");
		return `GPT ${version}${suffix ? ` ${suffix}` : ""}`;
	}

	if (normalizedModel.startsWith("codex")) {
		const suffix = formatModelSuffix(normalizedModel.slice("codex".length));
		return suffix ? `Codex ${suffix}` : "Codex";
	}

	return formatFallbackModelLabel(model);
}

export function getModelBadgeTone(model: string): ModelBadgeTone {
	const normalizedModel = modelLeaf(model);

	if (isClaudeModel(normalizedModel)) {
		return {
			chipClassName:
				"border-transparent bg-[#CC7D5E] text-[#F9F9F7] shadow-none",
			icon: "claude",
			identityIconClassName: "text-[#CC7D5E]",
		};
	}

	if (isOpenAiModel(normalizedModel)) {
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
