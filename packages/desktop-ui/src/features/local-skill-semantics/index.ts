import type { SkillArtifact } from "@rudel/skill-schema";

const TYPESCRIPT_STANDARDS_SLUG = "typescript-standards";
const UNKNOWN_SLUG = "unknown";

export function inferArtifactSlug(artifact: SkillArtifact): string {
	const frontmatterSlug = slugify(artifact.name ?? "");
	if (frontmatterSlug) return frontmatterSlug;

	const normalizedPath = normalizePath(
		artifact.repoRelativePath ?? artifact.path,
	);
	const segments = normalizedPath.split("/").filter(Boolean);
	const fileName = segments[segments.length - 1] ?? "";
	const parentFolderName = segments[segments.length - 2] ?? "";

	if (fileName === "SKILL.md") {
		return slugify(parentFolderName) || UNKNOWN_SLUG;
	}

	const fileSlug = slugify(removeFileExtension(fileName));
	return fileSlug || UNKNOWN_SLUG;
}

export function matchesTypescriptStandards(artifact: SkillArtifact): boolean {
	if (artifact.lockfileEntry?.blueprintId === TYPESCRIPT_STANDARDS_SLUG) {
		return true;
	}

	return inferArtifactSlug(artifact) === TYPESCRIPT_STANDARDS_SLUG;
}

export function isManagedArtifact(artifact: SkillArtifact): boolean {
	return artifact.lockfileEntry !== undefined;
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}

function removeFileExtension(fileName: string): string {
	const dotIndex = fileName.lastIndexOf(".");
	if (dotIndex <= 0) return fileName;
	return fileName.slice(0, dotIndex);
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
