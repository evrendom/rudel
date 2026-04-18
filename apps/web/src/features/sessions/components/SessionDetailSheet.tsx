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
				className="dashboardy-page max-w-none overflow-hidden border-l border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] p-0 text-[color:var(--dashboardy-heading)] shadow-[0_20px_60px_rgba(15,23,42,0.08)] data-[side=right]:w-[90vw] data-[side=right]:rounded-l-[1.5rem] data-[side=right]:sm:w-[72vw] data-[side=right]:sm:max-w-[72vw]"
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
					<SessionDetailView sessionId={sessionId} trackView={false} />
				) : null}
			</SheetContent>
		</Sheet>
	);
}
