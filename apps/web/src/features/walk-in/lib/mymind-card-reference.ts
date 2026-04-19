import { thinkerTradingCardTemplate } from "@/features/walk-in/data/thinker-achievement";

export interface MymindCardLayerReference {
	description: string;
	field: string;
	url: string | null;
}

export interface MymindCardSupportAsset {
	name: string;
	url: string;
}

export const MYMIND_FRONT_LAYER_REFERENCES: readonly MymindCardLayerReference[] = [
	{
		description: "Base illustration and the deepest visible front-face layer.",
		field: "artworkImage",
		url: thinkerTradingCardTemplate.artworkImage,
	},
	{
		description: "Optional mid layer for extra objects or glass details.",
		field: "foregroundImage",
		url: thinkerTradingCardTemplate.foregroundImage,
	},
	{
		description: "FX and texture layer that sits over the artwork.",
		field: "overlayImage",
		url: thinkerTradingCardTemplate.overlayImage,
	},
	{
		description: "Decorative frame that wraps the perimeter of the card.",
		field: "frameImage",
		url: thinkerTradingCardTemplate.frameImage,
	},
	{
		description: "Pictogram mask near the top-most front layers.",
		field: "pictoAlphaMap",
		url: thinkerTradingCardTemplate.pictoAlphaMap,
	},
	{
		description: "Orb mask rendered over the front stack.",
		field: "orbAlphaMap",
		url: thinkerTradingCardTemplate.orbAlphaMap,
	},
] as const;

export const MYMIND_FRONT_NORMAL_REFERENCES: readonly MymindCardLayerReference[] =
	[
		{
			description: "Normal map paired with the artwork layer.",
			field: "artworkNormalMap",
			url: thinkerTradingCardTemplate.artworkNormalMap,
		},
		{
			description: "Normal map for the optional foreground layer.",
			field: "foregroundNormalMap",
			url: thinkerTradingCardTemplate.foregroundNormalMap,
		},
		{
			description: "Normal map for the overlay layer.",
			field: "overlayNormalMap",
			url: thinkerTradingCardTemplate.overlayNormalMap,
		},
		{
			description: "Normal map paired with the pictogram mask.",
			field: "pictoNormalMap",
			url: thinkerTradingCardTemplate.pictoNormalMap,
		},
		{
			description: "Normal map paired with the orb mask.",
			field: "orbNormalMap",
			url: thinkerTradingCardTemplate.orbNormalMap,
		},
	] as const;

export const MYMIND_BACK_ASSET_REFERENCES: readonly MymindCardSupportAsset[] = [
	{
		name: "back visual",
		url: "https://static.accelerator.net/134/0.94.1/tcg/assets/visuals/back.jpg",
	},
	{
		name: "back alpha",
		url: "https://static.accelerator.net/134/0.94.1/tcg/assets/alphas/back_alpha.jpg",
	},
] as const;

export const MYMIND_SUPPORT_ASSET_REFERENCES: readonly MymindCardSupportAsset[] =
	[
		{
			name: "light clouds background",
			url: "https://static.accelerator.net/134/0.94.1/tcg/assets/backgrounds/light-clouds.png",
		},
		{
			name: "cloud normal map",
			url: "https://static.accelerator.net/134/0.94.1/tcg/assets/normals/normal_cloud.png",
		},
		{
			name: "shared highlight normal map",
			url: "https://static.accelerator.net/134/0.94.1/tcg/assets/normals/normal_test5.jpg",
		},
	] as const;

export const MYMIND_IMPLEMENTATION_FILE_REFERENCES = {
	cardComponent:
		"apps/web/src/features/walk-in/MymindWrappedCard.tsx",
	cardModel:
		"apps/web/src/features/walk-in/lib/build-walk-in-card-model.ts",
	cardTemplate:
		"apps/web/src/features/walk-in/data/thinker-achievement.ts",
	runtimeBridge:
		"apps/web/src/features/walk-in/lib/mymind-runtime.ts",
	routePage:
		"apps/web/src/features/walk-in/RudelWalkInPage.tsx",
} as const;
