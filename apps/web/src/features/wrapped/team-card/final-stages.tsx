import {
	ChevronLeft,
	ChevronRight,
	Clipboard,
	Download,
	Share2,
} from "lucide-react";
import type { CSSProperties, RefObject } from "react";
import { appRoutes } from "@/app/routes";
import { Button } from "@/app/ui/button";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
	type WrappedTeamMemberCardStatLayerOpacities,
	type WrappedTeamMemberCardTheme,
} from "./card";
import type { WrappedCardTiltController } from "./tilt/use-card-tilt";

interface WrappedTeamCardStageCardProps {
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
}

interface WrappedTeamCardShareStageProps extends WrappedTeamCardStageCardProps {
	onBack: () => void;
	onCopy: () => void | Promise<void>;
	onDownload: () => void | Promise<void>;
	onShare: () => void | Promise<void>;
	shareCardCreatedAtLabel: string;
	sharePostRef: RefObject<HTMLDivElement | null>;
	shareUrl?: string;
	shareUrlLabel: string;
}

interface WrappedTeamCardRevealStageProps
	extends WrappedTeamCardStageCardProps {
	selectedThemeLabel: string;
	onNextArchetype: () => void;
	onPreviousArchetype: () => void;
	tiltController: WrappedCardTiltController;
}

export function WrappedTeamCardShareStage(
	props: WrappedTeamCardShareStageProps,
) {
	const {
		headerLeftMetric,
		headerRightMetric,
		onBack,
		onCopy,
		onDownload,
		onShare,
		row,
		shareCardCreatedAtLabel,
		sharePostRef,
		shareUrl,
		shareUrlLabel,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
	} = props;

	return (
		<section className="mymind-wrapped-final-stage mymind-wrapped-final-stage--share">
			<div className="mymind-wrapped-final-stage__copy">
				<p className="mymind-wrapped-final-stage__eyebrow">Post preview</p>
				<h1 className="mymind-wrapped-final-stage__headline">
					Ready to share.
				</h1>
				<p className="mymind-wrapped-final-stage__subline">
					This is the exact post that gets exported. Nothing extra gets added
					after you tap share.
				</p>
			</div>

			<div className="mymind-wrapped-final-stage__object">
				<div ref={sharePostRef} className="mymind-wrapped-share-preview">
					<div className="mymind-wrapped-share-preview__shell team-lineup-surface-scope">
						<div className="mymind-wrapped-share-preview__top">
							<img
								src="/assets/wordmark-dark-BeVDO32X.svg"
								alt="rudel.ai"
								className="h-4 w-auto"
							/>
							<div className="flex items-center gap-2.5">
								<SharePostAnthropicLogo />
								<SharePostCodexLogo />
							</div>
						</div>

						<div className="mymind-wrapped-share-preview__body">
							<div className="team-lineup-card-tilt-stage w-full max-w-[13.4rem]">
								<div className="team-lineup-card-tilt-shell [--wrapped-card-render-scale:0.92]">
									<div className="grid justify-center">
										<WrappedTeamMemberCard
											headerLeftMetric={headerLeftMetric}
											headerRightMetric={headerRightMetric}
											hideHeaderLogo
											layoutPreset="team-card-preview"
											mediaPanelClassName="mx-auto"
											row={row}
											shellClassName={shellClassName}
											shellStyle={shellStyle}
											statItems={statItems}
											statLayerOpacities={statLayerOpacities}
											statTileClassName=""
											theme={theme}
										/>
									</div>
								</div>
							</div>
						</div>

						<div className="mymind-wrapped-share-preview__meta">
							<a
								href={shareUrl ?? appRoutes.wrappedTeamCard()}
								className="mymind-wrapped-share-preview__link"
							>
								{shareUrlLabel}
							</a>
							<span className="mymind-wrapped-share-preview__timestamp">
								{shareCardCreatedAtLabel}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="mymind-wrapped-final-stage__support">
				<nav className="mymind-wrapped-share-actions">
					<Button
						type="button"
						size="lg"
						className="mymind-wrapped-share-actions__primary"
						onClick={onShare}
					>
						<Share2 className="size-4" />
						Share post
					</Button>
					<div className="mymind-wrapped-share-actions__grid">
						<Button
							type="button"
							size="lg"
							variant="outline"
							className="mymind-wrapped-share-actions__secondary"
							onClick={onCopy}
						>
							<Clipboard className="size-4" />
							Copy image
						</Button>
						<Button
							type="button"
							size="lg"
							variant="outline"
							className="mymind-wrapped-share-actions__secondary"
							onClick={onDownload}
						>
							<Download className="size-4" />
							Download PNG
						</Button>
					</div>
				</nav>

				<button
					type="button"
					className="mymind-wrapped-final-stage__back"
					onClick={onBack}
				>
					Back to card
				</button>
			</div>
		</section>
	);
}

export function WrappedTeamCardRevealStage(
	props: WrappedTeamCardRevealStageProps,
) {
	const {
		selectedThemeLabel,
		headerLeftMetric,
		headerRightMetric,
		onNextArchetype,
		onPreviousArchetype,
		row,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
		tiltController,
	} = props;

	return (
		<section className="mymind-wrapped-final-stage mymind-wrapped-final-stage--reveal">
			<div className="mymind-wrapped-final-stage__copy">
				<p className="mymind-wrapped-final-stage__eyebrow">Choose your card</p>
				<h1 className="mymind-wrapped-final-stage__headline">
					Pick the one you&apos;d post.
				</h1>
				<p className="mymind-wrapped-final-stage__subline">
					The next page turns this card into a share post. You can still come
					back and change it.
				</p>
			</div>

			<div className="mymind-wrapped-final-stage__object mymind-wrapped-final-stage__object--card">
				<div className="mymind-wrapped-final-stage__card-frame">
					<div className="team-lineup-card-tilt-stage w-full max-w-[17rem] min-[360px]:max-w-[18rem] sm:max-w-none">
						<div
							ref={tiltController.cardTiltRef}
							className="team-lineup-card-tilt-shell mymind-wrapped-final-stage__tilt-shell [--wrapped-card-render-scale:1.1] min-[360px]:[--wrapped-card-render-scale:1.2] sm:[--wrapped-card-render-scale:1.5] lg:[--wrapped-card-render-scale:1.64]"
							onPointerMove={tiltController.handlePointerMove}
							onPointerLeave={tiltController.handlePointerLeave}
							onPointerCancel={tiltController.handlePointerLeave}
						>
							<div className="grid justify-center">
								<WrappedTeamMemberCard
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									layoutPreset="team-card-preview"
									mediaPanelClassName="mx-auto"
									row={row}
									shellClassName={shellClassName}
									shellStyle={shellStyle}
									statItems={statItems}
									statLayerOpacities={statLayerOpacities}
									statTileClassName=""
									theme={theme}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="mymind-wrapped-final-stage__support">
				<div className="mymind-wrapped-archetype-switcher">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						className="mymind-wrapped-archetype-switcher__button"
						onClick={onPreviousArchetype}
					>
						<ChevronLeft />
					</Button>

					<div className="mymind-wrapped-archetype-switcher__pill">
						<div className="mymind-wrapped-archetype-switcher__label">
							Selected theme
						</div>
						<div className="mymind-wrapped-archetype-switcher__value">
							{selectedThemeLabel}
						</div>
					</div>

					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						className="mymind-wrapped-archetype-switcher__button"
						onClick={onNextArchetype}
					>
						<ChevronRight />
					</Button>
				</div>
			</div>
		</section>
	);
}

export function WrappedTeamCardRevealFooter(props: {
	onContinueToDashboard: () => void;
	onPreviewPost: () => void;
}) {
	const { onContinueToDashboard, onPreviewPost } = props;

	return (
		<div className="mymind-wrapped-action-stack">
			<Button
				type="button"
				className="mymind-wrapped-primary-action h-11 rounded-full bg-[#4f7cff] px-7 text-[19px] font-bold text-white shadow-[0_16px_28px_rgba(79,124,255,0.24)] hover:bg-[#4472f4] [font-family:var(--app-font-heading)]"
				onClick={onPreviewPost}
			>
				<span>Preview post</span>
				<span className="mymind-wrapped-primary-action__icon">
					<ChevronRight className="size-4" />
				</span>
			</Button>
			<button
				type="button"
				className="mymind-wrapped-secondary-action [font-family:var(--font-sans)] text-[0.98rem] font-semibold"
				onClick={onContinueToDashboard}
			>
				Continue to dashboard
			</button>
		</div>
	);
}

export function WrappedTeamCardShareFooter(props: {
	onContinueToDashboard: () => void;
}) {
	const { onContinueToDashboard } = props;

	return (
		<div className="mymind-wrapped-action-stack">
			<Button
				type="button"
				className="mymind-wrapped-primary-action h-11 rounded-full bg-[#4f7cff] px-7 text-[19px] font-bold text-white shadow-[0_16px_28px_rgba(79,124,255,0.24)] hover:bg-[#4472f4] [font-family:var(--app-font-heading)]"
				onClick={onContinueToDashboard}
			>
				Continue to dashboard
			</Button>
		</div>
	);
}

function SharePostAnthropicLogo() {
	return (
		<svg
			viewBox="0 0 1200 1200"
			aria-hidden="true"
			className="h-4 w-4 shrink-0"
		>
			<path
				fill="currentColor"
				d="M233.959793 800.214905L468.644287 668.536987L472.590637 657.100647L468.644287 650.738403L457.208069 650.738403L417.986633 648.322144L283.892639 644.69812L167.597321 639.865845L54.926208 633.825623L26.577238 627.785339L0.00033 592.751709L2.73832 575.27533L26.577238 559.248352L60.724873 562.228149L136.187973 567.382629L249.422867 575.194763L331.570496 580.026978L453.261841 592.671082L472.590637 592.671082L475.328857 584.859009L468.724915 580.026978L463.570557 575.194763L346.389313 495.785217L219.543671 411.865906L153.100723 363.543762L117.181267 339.060425L99.060455 316.107361L91.248367 266.01355L123.865784 230.093994L167.677887 233.073853L178.872513 236.053772L223.248367 270.201477L318.040283 343.570496L441.825592 434.738342L459.946411 449.798706L467.194672 444.64447L468.080597 441.020203L459.946411 427.409485L392.617493 305.718323L320.778564 181.932983L288.80542 130.630859L280.348999 99.865845C277.369171 87.221436 275.194641 76.590698 275.194641 63.624268L312.322174 13.20813L332.8591 6.604126L382.389313 13.20813L403.248352 31.328979L434.013519 101.71814L483.865753 212.537048L561.181274 363.221497L583.812134 407.919434L595.892639 449.315491L600.40271 461.959839L608.214783 461.959839L608.214783 454.711609L614.577271 369.825623L626.335632 265.61084L637.771851 131.516846L641.718201 93.745117L660.402832 48.483276L697.530334 24.000122L726.52356 37.852417L750.362549 72L747.060486 94.067139L732.886047 186.201416L705.100708 330.52356L686.979919 427.167847L697.530334 427.167847L709.61084 415.087341L758.496704 350.174561L840.644348 247.490051L876.885925 206.738342L919.167847 161.71814L946.308838 140.29541L997.61084 140.29541L1035.38269 196.429626L1018.469849 254.416199L965.637634 321.422852L921.825562 378.201538L859.006714 462.765259L819.785278 530.41626L823.409424 535.812073L832.75177 534.92627L974.657776 504.724915L1051.328979 490.872559L1142.818848 475.167786L1184.214844 494.496582L1188.724854 514.147644L1172.456421 554.335693L1074.604126 578.496765L959.838989 601.449829L788.939636 641.879272L786.845764 643.409485L789.261841 646.389343L866.255127 653.637634L899.194702 655.409424L979.812134 655.409424L1129.932861 666.604187L1169.154419 692.537109L1192.671265 724.268677L1188.724854 748.429688L1128.322144 779.194641L1046.818848 759.865845L856.590759 714.604126L791.355774 698.335754L782.335693 698.335754L782.335693 703.731567L836.69812 756.885986L936.322205 846.845581L1061.073975 962.81897L1067.436279 991.490112L1051.409424 1014.120911L1034.496704 1011.704712L924.885986 929.234924L882.604126 892.107544L786.845764 811.48999L780.483276 811.48999L780.483276 819.946289L802.550415 852.241699L919.087341 1027.409424L925.127625 1081.127686L916.671204 1098.604126L886.469849 1109.154419L853.288696 1103.114136L785.073914 1007.355835L714.684631 899.516785L657.906067 802.872498L650.979858 806.81897L617.476624 1167.704834L601.771851 1186.147705L565.530212 1200L535.328857 1177.046997L519.302124 1139.919556L535.328857 1066.550537L554.657776 970.792053L570.362488 894.68457L584.536926 800.134277L592.993347 768.724976L592.429626 766.630859L585.503479 767.516968L514.22821 865.369263L405.825531 1011.865906L320.053711 1103.677979L299.516815 1111.812256L263.919525 1093.369263L267.221497 1060.429688L287.114136 1031.114136L405.825531 880.107361L477.422913 786.52356L523.651062 732.483276L523.328918 724.671265L520.590698 724.671265L205.288605 929.395935L149.154434 936.644409L124.993355 914.01355L127.973183 876.885986L139.409409 864.80542L234.201385 799.570435L233.879227 799.8927Z"
			/>
		</svg>
	);
}

function SharePostCodexLogo() {
	return (
		<svg viewBox="0 0 320 320" aria-hidden="true" className="h-4 w-4 shrink-0">
			<path
				fill="currentColor"
				d="M297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
			/>
		</svg>
	);
}
