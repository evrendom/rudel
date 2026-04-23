import { useParams } from "react-router-dom";
import { SessionDetailView } from "@/features/sessions/components/SessionDetailView";

export function SessionDetailPage() {
	const params = useParams<{ sessionId: string }>();
	const sessionId = params.sessionId;

	if (!sessionId) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<p className="mb-2 text-lg font-semibold text-status-error-icon">
						Session Not Found
					</p>
				</div>
			</div>
		);
	}

	return <SessionDetailView sessionId={sessionId} />;
}
