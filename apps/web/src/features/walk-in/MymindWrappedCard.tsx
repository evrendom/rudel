import * as React from "react";
import { buildRootCardRuntimeOptions } from "@/features/walk-in/lib/build-root-card-runtime-options";
import type { WalkInCardModel } from "@/features/walk-in/lib/build-walk-in-card-model";
import {
	ensureExternalScript,
	ensureExternalStylesheet,
	MYMIND_ACHIEVEMENTS_STYLES_URL,
	MYMIND_GSAP_SCRIPT_URL,
	MYMIND_TRADING_CARD_SCRIPT_URL,
	type MymindTradingCardInstance,
} from "@/features/walk-in/lib/mymind-runtime";
import { cn } from "@/lib/utils";
import "@/features/walk-in/walk-in-clone.css";

type CardRuntimeState = "error" | "loading" | "ready";

export interface MymindWrappedCardProps {
	accountLabel: string;
	avatarSrc: string;
	className?: string;
	model: WalkInCardModel;
	organizationLogoSrc: string | null;
	organizationName: string | null;
}

export function MymindWrappedCard(props: MymindWrappedCardProps) {
	const {
		accountLabel,
		avatarSrc,
		className,
		model,
		organizationLogoSrc,
		organizationName,
	} = props;
	const cardInstanceRef = React.useRef<MymindTradingCardInstance | null>(null);
	const runtimeContainerRef = React.useRef<HTMLDivElement | null>(null);
	const [runtimeState, setRuntimeState] =
		React.useState<CardRuntimeState>("loading");
	const [resolvedAvatarSrc, setResolvedAvatarSrc] = React.useState(avatarSrc);
	const [resolvedOrganizationLogoSrc, setResolvedOrganizationLogoSrc] =
		React.useState<string | null>(organizationLogoSrc);
	const visualStyle: React.CSSProperties & {
		"--mymind-walk-in-accent": string;
		"--mymind-walk-in-accent-glow": string;
	} = {
		"--mymind-walk-in-accent": model.accentColor,
		"--mymind-walk-in-accent-glow": model.accentGlow,
	};

	React.useEffect(() => {
		document.body.classList.add("mymind-walk-in-body");

		return () => {
			document.body.classList.remove("mymind-walk-in-body");
		};
	}, []);

	React.useEffect(() => {
		let isCancelled = false;

		void Promise.all([
			resolveRuntimeAssetSource(avatarSrc),
			resolveRuntimeAssetSource(organizationLogoSrc),
		]).then(([nextAvatarSrc, nextOrganizationLogoSrc]) => {
			if (isCancelled) {
				return;
			}

			setResolvedAvatarSrc(nextAvatarSrc ?? avatarSrc);
			setResolvedOrganizationLogoSrc(
				nextOrganizationLogoSrc ?? organizationLogoSrc,
			);
		});

		return () => {
			isCancelled = true;
		};
	}, [avatarSrc, organizationLogoSrc]);

	const runtimeOptions = React.useMemo(
		() =>
			buildRootCardRuntimeOptions({
				accountLabel,
				avatarSrc: resolvedAvatarSrc,
				model,
				organizationLogoSrc: resolvedOrganizationLogoSrc,
				organizationName,
			}),
		[
			accountLabel,
			model,
			organizationName,
			resolvedAvatarSrc,
			resolvedOrganizationLogoSrc,
		],
	);

	React.useEffect(() => {
		let isCancelled = false;
		const cleanupStylesheet = ensureExternalStylesheet(
			MYMIND_ACHIEVEMENTS_STYLES_URL,
		);

		setRuntimeState("loading");

		void Promise.all([
			ensureExternalScript(MYMIND_GSAP_SCRIPT_URL),
			ensureExternalScript(MYMIND_TRADING_CARD_SCRIPT_URL),
		])
			.then(() => {
				const runtimeContainer = runtimeContainerRef.current;

				if (
					isCancelled ||
					!runtimeContainer ||
					typeof window.TradingCard !== "function"
				) {
					return;
				}

				cardInstanceRef.current?.dispose();
				runtimeContainer.replaceChildren();
				cardInstanceRef.current = new window.TradingCard({
					...runtimeOptions,
					container: runtimeContainer,
				});
				setRuntimeState("ready");
			})
			.catch(() => {
				if (isCancelled) {
					return;
				}

				setRuntimeState("error");
			});

		return () => {
			isCancelled = true;
			cardInstanceRef.current?.dispose();
			cardInstanceRef.current = null;
			runtimeContainerRef.current?.replaceChildren();
			cleanupStylesheet();
		};
	}, [runtimeOptions]);

	return (
		<div
			className={cn("mymind-walk-in__card-stage", className)}
			style={visualStyle}
		>
			<div ref={runtimeContainerRef} className="mymind-walk-in__card-runtime" />
			{runtimeState === "ready" ? null : (
				<div className="mymind-walk-in__runtime-fallback">
					<p className="mymind-walk-in__runtime-fallback-kicker">
						{runtimeState === "error" ? "WebGL unavailable" : "Initializing"}
					</p>
					<h3>{model.archetypeLabel}</h3>
					<p>{model.cardSubtitle}</p>
				</div>
			)}
		</div>
	);
}

async function resolveRuntimeAssetSource(source: string | null | undefined) {
	if (!source) {
		return null;
	}

	if (source.startsWith("data:") || typeof window === "undefined") {
		return source;
	}

	const absoluteSource = new URL(source, window.location.href).href;

	if (new URL(absoluteSource).origin === window.location.origin) {
		return absoluteSource;
	}

	try {
		const response = await fetch(absoluteSource, { mode: "cors" });

		if (!response.ok) {
			return absoluteSource;
		}

		const blob = await response.blob();
		return await readBlobAsDataUrl(blob);
	} catch {
		return absoluteSource;
	}
}

function readBlobAsDataUrl(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}

			reject(new Error("Failed to read blob as data URL."));
		};
		reader.onerror = () => {
			reject(reader.error ?? new Error("Failed to read blob as data URL."));
		};
		reader.readAsDataURL(blob);
	});
}
