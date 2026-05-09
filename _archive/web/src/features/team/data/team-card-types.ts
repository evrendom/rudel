export type TeamCardTone =
	| "blue"
	| "teal"
	| "orange"
	| "lime"
	| "violet"
	| "rose"
	| "slate";

export interface TeamPlayerCardData {
	overall: number;
	role: string;
	archetype: string;
	badgeInitials: string;
	badgeTone: TeamCardTone;
	shellTone?: TeamCardTone;
	portraitImageSrc?: string;
	name: string;
	subtitle: string;
	stats: {
		OUT: number;
		SPD: number;
		CRA: number;
		QUA: number;
		EFF: number;
		CON: number;
	};
	featured?: boolean;
	columnStart2xl?: 1 | 2 | 3;
}
