import type { DeveloperTeamCard } from "@rudel/api-routes";
import alvaroPortrait from "@/features/team/assets/team-lineup-alvaro-portrait.png";
import josePortrait from "@/features/team/assets/team-lineup-jose-portrait.png";
import marcPortrait from "@/features/team/assets/team-lineup-marc-portrait.png";
import rafaPortrait from "@/features/team/assets/team-lineup-rafa-portrait.png";
import { teamCardTemplates } from "@/features/team/data/team-card-templates";
import type { TeamPlayerCardData } from "@/features/team/data/team-card-types";

export type TeamDeveloperCardSource = readonly DeveloperTeamCard[];

export interface TeamRosterMemberSource {
	userId: string;
	displayName: string;
	email?: string | null;
	imageUrl?: string | null;
	role?: string | null;
}

const featuredTemplate = teamCardTemplates.find((player) => player.featured);
const rosterTemplates = teamCardTemplates.filter((player) => !player.featured);

function normalizePortraitName(name: string) {
	return name
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function getTeamPortraitImage(name: string) {
	const normalizedName = normalizePortraitName(name);

	if (normalizedName.includes("rafa")) {
		return rafaPortrait;
	}

	if (normalizedName.includes("alvaro") || normalizedName.includes("alvro")) {
		return alvaroPortrait;
	}

	if (normalizedName.includes("marc")) {
		return marcPortrait;
	}

	if (normalizedName.includes("jose")) {
		return josePortrait;
	}

	return undefined;
}

function getNameInitials(name: string) {
	const parts = name.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "TM";
	}

	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}

	return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function formatFavoriteModelLabel(model: string | null | undefined) {
	if (!model) {
		return null;
	}

	const normalizedModel = model.trim().toLowerCase();

	if (normalizedModel.includes("opus")) {
		return "Opus main";
	}

	if (normalizedModel.includes("sonnet")) {
		return "Sonnet main";
	}

	if (normalizedModel.includes("haiku")) {
		return "Haiku main";
	}

	if (normalizedModel.includes("gpt")) {
		return "GPT main";
	}

	return model;
}

function buildPlayerSubtitle({
	fallbackSubtitle,
	favoriteModel,
	topSkills,
}: {
	fallbackSubtitle: string;
	favoriteModel?: string | null;
	topSkills?: readonly { name: string; count: number }[];
}) {
	const favoriteModelLabel = formatFavoriteModelLabel(favoriteModel);
	if (favoriteModelLabel) {
		return favoriteModelLabel;
	}

	const topSkill = topSkills?.[0]?.name?.trim();
	if (topSkill) {
		return topSkill;
	}

	return fallbackSubtitle;
}

function createPlayerFromTemplate(
	template: TeamPlayerCardData,
	playerSource: {
		displayName: string;
		fallbackSubtitle?: string;
		favoriteModel?: string | null;
		imageUrl?: string | null;
		topSkills?: readonly { name: string; count: number }[];
	},
	featured: boolean,
): TeamPlayerCardData {
	const displayName = playerSource.displayName.trim();
	const portraitImageSrc =
		playerSource.imageUrl?.trim() || getTeamPortraitImage(displayName);

	return {
		...template,
		featured,
		name: displayName,
		badgeInitials: getNameInitials(displayName),
		portraitImageSrc,
		subtitle: buildPlayerSubtitle({
			fallbackSubtitle: playerSource.fallbackSubtitle ?? template.subtitle,
			favoriteModel: playerSource.favoriteModel,
			topSkills: playerSource.topSkills,
		}),
		columnStart2xl: featured ? undefined : template.columnStart2xl,
	};
}

function buildPlayerFromMember(
	template: TeamPlayerCardData,
	member: TeamRosterMemberSource,
	featured: boolean,
) {
	return createPlayerFromTemplate(
		template,
		{
			displayName: member.displayName,
			fallbackSubtitle: "Workspace member",
			imageUrl: member.imageUrl,
		},
		featured,
	);
}

function buildPlayerFromTeamCard(
	template: TeamPlayerCardData,
	teamCard: DeveloperTeamCard,
	featured: boolean,
	member?: TeamRosterMemberSource,
) {
	return createPlayerFromTemplate(
		template,
		{
			displayName: teamCard.display_name,
			favoriteModel: teamCard.favorite_model,
			imageUrl: member?.imageUrl,
			topSkills: teamCard.top_skills,
		},
		featured,
	);
}

export function buildTeamRosterPlayers(
	teamCards: TeamDeveloperCardSource | undefined,
	members: readonly TeamRosterMemberSource[] = [],
): TeamPlayerCardData[] {
	if (!featuredTemplate || rosterTemplates.length === 0) {
		return [];
	}

	const realPlayers = (teamCards ?? []).filter(
		(teamCard) => teamCard.display_name.trim().length > 0,
	);
	const validMembers = members.filter(
		(member) => member.displayName.trim().length > 0,
	);

	if (validMembers.length === 0 && realPlayers.length === 0) {
		return [];
	}

	if (validMembers.length === 0) {
		return realPlayers.map((teamCard, index) => {
			if (index === 0) {
				return buildPlayerFromTeamCard(featuredTemplate, teamCard, true);
			}

			const template = rosterTemplates[(index - 1) % rosterTemplates.length];
			return buildPlayerFromTeamCard(template, teamCard, false);
		});
	}

	const analyticsByUserId = new Map(
		realPlayers.map((teamCard) => [teamCard.user_id, teamCard] as const),
	);

	const sortedMembers = [...validMembers].sort((leftMember, rightMember) => {
		const leftAnalytics = analyticsByUserId.get(leftMember.userId);
		const rightAnalytics = analyticsByUserId.get(rightMember.userId);

		if (leftAnalytics && rightAnalytics) {
			return (
				rightAnalytics.total_tokens - leftAnalytics.total_tokens ||
				leftMember.displayName.localeCompare(rightMember.displayName)
			);
		}

		if (leftAnalytics) {
			return -1;
		}

		if (rightAnalytics) {
			return 1;
		}

		return leftMember.displayName.localeCompare(rightMember.displayName);
	});

	return sortedMembers.map((member, index) => {
		const teamCard = analyticsByUserId.get(member.userId);

		if (index === 0) {
			if (teamCard) {
				return buildPlayerFromTeamCard(
					featuredTemplate,
					teamCard,
					true,
					member,
				);
			}

			return buildPlayerFromMember(featuredTemplate, member, true);
		}

		const template = rosterTemplates[(index - 1) % rosterTemplates.length];

		if (teamCard) {
			return buildPlayerFromTeamCard(template, teamCard, false, member);
		}

		return buildPlayerFromMember(template, member, false);
	});
}
