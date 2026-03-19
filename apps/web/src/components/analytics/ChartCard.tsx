import { Clipboard, Download, Share2, Twitter } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { toast } from "sonner";
import { useUiControlTracking } from "@/hooks/useDashboardAnalytics";
import {
	captureElement,
	copyToClipboard,
	downloadAsImage,
	shareToX,
} from "../../lib/screenshot";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { AnalyticsCard } from "./AnalyticsCard";

interface ChartCardProps {
	title: string;
	titleSuffix?: ReactNode;
	description?: string;
	children: ReactNode;
	className?: string;
	shareable?: boolean;
}

export function ChartCard({
	title,
	titleSuffix,
	description,
	children,
	className,
	shareable = true,
}: ChartCardProps) {
	const chartRef = useRef<HTMLDivElement>(null);
	const { trackUiControl } = useUiControlTracking();

	const trackChartAction = (interactionType: "copy" | "download" | "share") => {
		trackUiControl({
			controlName: title.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
			controlType: "menu",
			interactionType,
		});
	};

	const handleCapture = async () => {
		if (!chartRef.current) return null;
		return captureElement(chartRef.current);
	};

	const handleShareToX = async () => {
		trackChartAction("share");
		const blob = await handleCapture();
		if (!blob) return;
		const copied = await copyToClipboard(blob);
		if (copied) {
			toast.success(
				"Chart image copied! Paste it into your X post with Cmd+V",
				{ duration: 8000 },
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
		shareToX("Check out my coding agents analytics, made with rudel.ai");
	};

	const handleCopyAsImage = async () => {
		trackChartAction("copy");
		const blob = await handleCapture();
		if (!blob) return;
		const copied = await copyToClipboard(blob);
		if (copied) {
			toast.success("Chart copied to clipboard");
		} else {
			toast.error("Failed to copy — try downloading instead");
		}
	};

	const handleDownload = async () => {
		trackChartAction("download");
		const blob = await handleCapture();
		if (!blob) return;
		const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
		const slug = title.toLowerCase().replace(/\s+/g, "-");
		downloadAsImage(blob, `rudel-${slug}-${timestamp}.png`);
		toast.success("Chart downloaded");
	};

	return (
		<AnalyticsCard className={className}>
			<div className="flex items-start justify-between mb-4">
				<div>
					<h2 className="text-xl font-bold text-heading">
						{title}
						{titleSuffix}
					</h2>
					{description && (
						<p className="text-sm text-muted mt-1">{description}</p>
					)}
				</div>
				{shareable && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="p-2 rounded-md hover:bg-hover text-muted hover:text-foreground transition-colors"
								aria-label="Share chart"
							>
								<Share2 className="h-4 w-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={handleShareToX}
								className="focus:bg-hover focus:text-foreground"
							>
								<Twitter className="h-4 w-4" />
								Share on X
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleCopyAsImage}
								className="focus:bg-hover focus:text-foreground"
							>
								<Clipboard className="h-4 w-4" />
								Copy as image
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={handleDownload}
								className="focus:bg-hover focus:text-foreground"
							>
								<Download className="h-4 w-4" />
								Download as PNG
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			<div ref={chartRef} className="relative">
				{children}
				{/* Watermark — inside chart area, behind data */}
				<div
					className="pointer-events-none select-none absolute inset-0 z-0 flex flex-col items-center pt-4"
					style={{ top: "10%" }}
					aria-hidden="true"
				>
					<span className="text-foreground text-2xl font-bold opacity-[0.08]">
						rudel.ai
					</span>
					<span className="text-foreground text-[0.65rem] opacity-[0.12] -mt-1">
						powered by ObsessionDB
					</span>
				</div>
			</div>
		</AnalyticsCard>
	);
}
