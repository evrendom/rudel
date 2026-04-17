import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/app/ui/sheet";
import { SessionDetailView } from "@/features/sessions/components/SessionDetailView";

export function SessionDetailSheet({
	sessionId,
	onOpenChange,
}: {
	sessionId: string | null;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Sheet open={sessionId !== null} onOpenChange={onOpenChange}>
			<SheetContent
				className="max-w-none p-0 data-[side=right]:w-[90vw] data-[side=right]:sm:w-[72vw] data-[side=right]:sm:max-w-[72vw]"
				overlayClassName="backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
			>
				<SheetHeader className="sr-only">
					<SheetTitle>Session details</SheetTitle>
					<SheetDescription>
						Inspect the full conversation, token usage, and tool activity for the
						selected session.
					</SheetDescription>
				</SheetHeader>
				{sessionId ? (
					<SessionDetailView
						sessionId={sessionId}
						trackView={false}
						utilitySourceComponent="session_detail_sheet"
					/>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
