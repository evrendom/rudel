import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
	ProviderAnchor,
	ProviderAnchorFeature,
} from "../../src/token-recount/report.js";
import type {
	RecountSource,
	TokenClasses,
} from "../../src/token-recount/types.js";

export async function readProviderAnchors(
	path: string,
	required: boolean,
): Promise<ProviderAnchor[]> {
	if (!existsSync(path)) {
		if (required)
			throw new Error(`Provider anchor file does not exist: ${path}`);
		return [];
	}
	const raw: unknown = JSON.parse(await readFile(path, "utf8"));
	const root = requireRecord(raw, "anchor file");
	if (root.version !== 1)
		throw new Error("Provider anchor file version must be 1.");
	if (!Array.isArray(root.anchors)) {
		throw new Error("Provider anchor file must contain an anchors array.");
	}
	const anchors = root.anchors.map((value, index) =>
		decodeAnchor(value, index),
	);
	const identities = new Set<string>();
	for (const anchor of anchors) {
		const identity = [
			anchor.source,
			anchor.organizationId,
			anchor.userId,
			anchor.sessionId,
		].join(":");
		if (identities.has(identity)) {
			throw new Error(`Duplicate provider anchor identity: ${anchor.name}`);
		}
		identities.add(identity);
	}
	return anchors;
}

function decodeAnchor(value: unknown, index: number): ProviderAnchor {
	const row = requireRecord(value, `anchors[${index}]`);
	const providerTokens = requireRecord(
		row.provider_tokens,
		`anchors[${index}].provider_tokens`,
	);
	const verifiedAt = requireNonEmptyString(
		row.verified_at,
		`anchors[${index}].verified_at`,
	);
	if (!Number.isFinite(Date.parse(verifiedAt))) {
		throw new Error(`anchors[${index}].verified_at must be an ISO date.`);
	}

	return {
		features: decodeFeatures(row.features, index),
		name: requireNonEmptyString(row.name, `anchors[${index}].name`),
		source: requireSource(row.source, `anchors[${index}].source`),
		organizationId: requireNonEmptyString(
			row.organization_id,
			`anchors[${index}].organization_id`,
		),
		userId: requireNonEmptyString(row.user_id, `anchors[${index}].user_id`),
		sessionId: requireNonEmptyString(
			row.session_id,
			`anchors[${index}].session_id`,
		),
		providerTokens: decodeProviderTokens(providerTokens, index),
		verifiedAt,
		evidenceReference: requireNonEmptyString(
			row.evidence_reference,
			`anchors[${index}].evidence_reference`,
		),
	};
}

function decodeFeatures(
	value: unknown,
	index: number,
): ProviderAnchorFeature[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error(`anchors[${index}].features must be an array.`);
	}
	const allowed = new Set<ProviderAnchorFeature>([
		"cache_1h",
		"long_context",
		"intro_boundary",
		"multi_model",
		"subagent_heavy",
		"capped",
		"codex_resume",
	]);
	return [
		...new Set(
			value.map((feature) => {
				if (
					typeof feature !== "string" ||
					!allowed.has(feature as ProviderAnchorFeature)
				) {
					throw new Error(
						`anchors[${index}].features contains an unsupported feature.`,
					);
				}
				return feature as ProviderAnchorFeature;
			}),
		),
	];
}

function decodeProviderTokens(
	value: Record<string, unknown>,
	index: number,
): TokenClasses {
	const prefix = `anchors[${index}].provider_tokens`;
	return {
		uncachedInputTokens: requireTokenCount(
			value.uncached_input_tokens,
			`${prefix}.uncached_input_tokens`,
		),
		cacheReadInputTokens: requireTokenCount(
			value.cache_read_input_tokens,
			`${prefix}.cache_read_input_tokens`,
		),
		cacheCreation5mInputTokens: requireTokenCount(
			value.cache_creation_5m_input_tokens,
			`${prefix}.cache_creation_5m_input_tokens`,
		),
		cacheCreation1hInputTokens: requireTokenCount(
			value.cache_creation_1h_input_tokens,
			`${prefix}.cache_creation_1h_input_tokens`,
		),
		outputTokens: requireTokenCount(
			value.output_tokens,
			`${prefix}.output_tokens`,
		),
	};
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`${name} has an unexpected shape.`);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, name: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${name} must be a non-empty string.`);
	}
	return value.trim();
}

function requireSource(value: unknown, name: string): RecountSource {
	if (value === "claude_code" || value === "codex") return value;
	throw new Error(`${name} must be claude_code or codex.`);
}

function requireTokenCount(value: unknown, name: string): number {
	if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
		throw new Error(`${name} must be a non-negative safe integer.`);
	}
	return value;
}
