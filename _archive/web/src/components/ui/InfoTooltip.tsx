import { Info } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";

interface InfoTooltipProps {
	text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Info className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help shrink-0 inline-block align-middle ml-1" />
				</TooltipTrigger>
				<TooltipContent className="max-w-[260px]">{text}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
