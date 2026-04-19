import type { ReactNode } from "react";
import { Layers3, Link as LinkIcon, Orbit, Route, ScanSearch, SquareStack } from "lucide-react";
import { Link } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { MymindWrappedCard } from "@/features/walk-in/MymindWrappedCard";
import {
	MYMIND_BACK_ASSET_REFERENCES,
	MYMIND_FRONT_LAYER_REFERENCES,
	MYMIND_FRONT_NORMAL_REFERENCES,
	MYMIND_IMPLEMENTATION_FILE_REFERENCES,
	MYMIND_SUPPORT_ASSET_REFERENCES,
} from "@/features/walk-in/lib/mymind-card-reference";
import { useWalkInCardData } from "@/features/walk-in/use-walk-in-card-data";

const CONSTRUCTION_STEPS = [
	{
		description:
			"Mount the external WebGL engine and stylesheet, then hand it a container element.",
		filePath: MYMIND_IMPLEMENTATION_FILE_REFERENCES.runtimeBridge,
		title: "1. Runtime bridge",
	},
	{
		description:
			"Define the front-face image stack, the title, the description, and the shader knobs for each layer.",
		filePath: MYMIND_IMPLEMENTATION_FILE_REFERENCES.cardTemplate,
		title: "2. Front face payload",
	},
	{
		description:
			"Map Rudel metrics into an archetype, accent color, and card copy before passing them into the trading-card options.",
		filePath: MYMIND_IMPLEMENTATION_FILE_REFERENCES.cardModel,
		title: "3. Data-to-card translation",
	},
	{
		description:
			"Compose the metric overlay, the fallback shell, and the runtime mount so the WebGL card sits inside the page.",
		filePath: MYMIND_IMPLEMENTATION_FILE_REFERENCES.cardComponent,
		title: "4. Visible card component",
	},
	{
		description:
			"Place the card in the route and surround it with whatever extra explanation or calls-to-action you want.",
		filePath: MYMIND_IMPLEMENTATION_FILE_REFERENCES.routePage,
		title: "5. Route composition",
	},
] as const;

export function MymindTutorialPage() {
	const { cardModel, wrappedDataState } = useWalkInCardData();

	return (
		<main className="mymind-walk-in-route">
			<div className="mx-auto flex min-h-screen w-full max-w-[1600px] px-6 py-10 sm:px-8 lg:px-12">
				<div className="grid w-full gap-10 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] xl:items-start">
					<div className="flex flex-col gap-6 xl:sticky xl:top-10">
						<div className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-white/12 bg-white/6 px-5 py-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
							<div>
								<p className="text-[0.72rem] uppercase tracking-[0.3em] text-white/46">
									Mymind Tutorial
								</p>
								<p className="mt-2 text-sm text-white/74">
									How this card is constituted in Rudel.
								</p>
							</div>
							<Link
								to={appRoutes.walkIn()}
								className="rounded-full border border-white/12 bg-white px-4 py-2 text-sm font-medium text-[#061019] transition hover:bg-[#f8fbff]"
							>
								Open /walk-in
							</Link>
						</div>

						<div className="flex justify-center xl:justify-start">
							<MymindWrappedCard model={cardModel} state={wrappedDataState} />
						</div>
					</div>

					<div className="grid gap-6">
						<section className="rounded-[2rem] border border-white/12 bg-white/6 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
							<p className="text-[0.72rem] uppercase tracking-[0.32em] text-white/46">
								Constitute The Card
							</p>
							<h1 className="mt-4 max-w-[14ch] font-[var(--app-font-heading)] text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
								Mymind card anatomy in one page.
							</h1>
							<p className="mt-4 max-w-[60ch] text-sm leading-7 text-white/74 sm:text-base">
								The front of the card is driven by a payload of image layers and
								shader values. The back of the card is a separate scene inside
								the external runtime. Rudel then wraps that engine with a metric
								overlay and route shell.
							</p>
						</section>

						<section className="grid gap-4 md:grid-cols-2">
							<InfoCard
								icon={<Route className="size-5" />}
								label="Live route"
								value={appRoutes.walkIn()}
							/>
							<InfoCard
								icon={<LinkIcon className="size-5" />}
								label="Tutorial route"
								value={appRoutes.mymindTuto()}
							/>
						</section>

						<section className="grid gap-6 lg:grid-cols-2">
							<ReferencePanel
								icon={<Layers3 className="size-5" />}
								title="Front Face Layers"
								description="Read these top-to-bottom as the semantic front-face stack, from deepest visual layer to top-most ornament."
							>
								{MYMIND_FRONT_LAYER_REFERENCES.map((layer) => (
									<ReferenceRow
										key={layer.field}
										title={layer.field}
										subtitle={layer.description}
										value={layer.url ?? "null"}
									/>
								))}
							</ReferencePanel>

							<ReferencePanel
								icon={<Orbit className="size-5" />}
								title="Front Face Normals"
								description="These maps drive the lighting response and embossed look of the front face."
							>
								{MYMIND_FRONT_NORMAL_REFERENCES.map((layer) => (
									<ReferenceRow
										key={layer.field}
										title={layer.field}
										subtitle={layer.description}
										value={layer.url ?? "null"}
									/>
								))}
							</ReferencePanel>
						</section>

						<section className="grid gap-6 lg:grid-cols-2">
							<ReferencePanel
								icon={<SquareStack className="size-5" />}
								title="Back Of Card"
								description="These are the confirmed remote assets for the reverse face of the trading card scene."
							>
								{MYMIND_BACK_ASSET_REFERENCES.map((asset) => (
									<ReferenceRow
										key={asset.name}
										title={asset.name}
										subtitle="remote asset"
										value={asset.url}
									/>
								))}
							</ReferencePanel>

							<ReferencePanel
								icon={<ScanSearch className="size-5" />}
								title="Support Assets"
								description="These shared textures and backgrounds are loaded by the runtime around the card scene."
							>
								{MYMIND_SUPPORT_ASSET_REFERENCES.map((asset) => (
									<ReferenceRow
										key={asset.name}
										title={asset.name}
										subtitle="runtime support asset"
										value={asset.url}
									/>
								))}
							</ReferencePanel>
						</section>

						<section className="rounded-[2rem] border border-white/12 bg-white/6 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
							<div className="flex items-center gap-3">
								<span className="flex size-10 items-center justify-center rounded-full border border-white/12 bg-white/8">
									<Route className="size-5" />
								</span>
								<div>
									<p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/46">
										Construction Flow
									</p>
									<h2 className="mt-1 font-[var(--app-font-heading)] text-2xl font-semibold tracking-[-0.05em]">
										How to rebuild the card on a new page.
									</h2>
								</div>
							</div>

							<div className="mt-6 grid gap-4">
								{CONSTRUCTION_STEPS.map((step) => (
									<div
										key={step.title}
										className="rounded-[1.4rem] border border-white/12 bg-black/18 p-4"
									>
										<p className="text-sm font-medium text-white">{step.title}</p>
										<p className="mt-2 text-sm leading-6 text-white/70">
											{step.description}
										</p>
										<code className="mt-3 block overflow-x-auto rounded-xl bg-white/8 px-3 py-2 text-xs text-[#b8ecff]">
											{step.filePath}
										</code>
									</div>
								))}
							</div>
						</section>
					</div>
				</div>
			</div>
		</main>
	);
}

function InfoCard(props: { icon: ReactNode; label: string; value: string }) {
	const { icon, label, value } = props;

	return (
		<div className="rounded-[1.5rem] border border-white/12 bg-white/6 p-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
			<div className="flex items-center gap-3 text-white/82">
				<span className="flex size-10 items-center justify-center rounded-full border border-white/12 bg-white/8">
					{icon}
				</span>
				<div>
					<p className="text-[0.72rem] uppercase tracking-[0.24em] text-white/46">
						{label}
					</p>
					<p className="mt-1 text-base font-medium text-white">{value}</p>
				</div>
			</div>
		</div>
	);
}

function ReferencePanel(props: {
	children: ReactNode;
	description: string;
	icon: ReactNode;
	title: string;
}) {
	const { children, description, icon, title } = props;

	return (
		<section className="rounded-[2rem] border border-white/12 bg-white/6 p-6 text-white shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
			<div className="flex items-center gap-3">
				<span className="flex size-10 items-center justify-center rounded-full border border-white/12 bg-white/8">
					{icon}
				</span>
				<div>
					<p className="text-[0.72rem] uppercase tracking-[0.28em] text-white/46">
						Reference
					</p>
					<h2 className="mt-1 font-[var(--app-font-heading)] text-2xl font-semibold tracking-[-0.05em]">
						{title}
					</h2>
				</div>
			</div>
			<p className="mt-4 text-sm leading-6 text-white/70">{description}</p>
			<div className="mt-5 grid gap-3">{children}</div>
		</section>
	);
}

function ReferenceRow(props: {
	subtitle: string;
	title: string;
	value: string;
}) {
	const { subtitle, title, value } = props;

	return (
		<div className="rounded-[1.35rem] border border-white/12 bg-black/18 p-4">
			<p className="text-sm font-medium text-white">{title}</p>
			<p className="mt-1 text-sm leading-6 text-white/66">{subtitle}</p>
			<code className="mt-3 block overflow-x-auto rounded-xl bg-white/8 px-3 py-2 text-xs text-[#b8ecff]">
				{value}
			</code>
		</div>
	);
}
