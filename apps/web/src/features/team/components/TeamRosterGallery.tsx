import { TeamPlayerCard } from "@/features/team/components/TeamPlayerCard";
import type { TeamPlayerCardData } from "@/features/team/data/team-card-types";

const playerColumnStartClassNames = {
	1: "2xl:col-start-1",
	2: "2xl:col-start-2",
	3: "2xl:col-start-3",
} as const;

export function TeamRosterGallery({
	players,
}: {
	players: TeamPlayerCardData[];
}) {
	return (
		<div className="team-lineup-surface-scope w-fit">
			<div className="grid gap-y-4 sm:grid-cols-2 sm:gap-x-5 2xl:grid-cols-3 2xl:gap-x-4">
				{players.map((player, index) => (
					<TeamPlayerCard
						key={
							player.featured
								? "featured-player"
								: `${player.archetype}-${index}`
						}
						player={player}
						className={
							player.columnStart2xl
								? playerColumnStartClassNames[player.columnStart2xl]
								: undefined
						}
					/>
				))}
			</div>
		</div>
	);
}
