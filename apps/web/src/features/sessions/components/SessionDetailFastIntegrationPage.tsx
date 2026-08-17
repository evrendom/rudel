import { QueryClientProvider } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { queryClient } from "@/lib/query-client";
import { SessionDetailFastContent } from "./session-detail-fast-content";
import { buildSessionDetailFastIntegrationOverview } from "./session-detail-fast-integration-data";

const overview = buildSessionDetailFastIntegrationOverview();

export function SessionDetailFastIntegrationPage() {
	const responseScrollRef = useRef<HTMLDivElement>(null);
	const [staleRevision, setStaleRevision] = useState(false);
	return (
		<QueryClientProvider client={queryClient}>
			<div
				className="h-dvh min-h-0 overflow-hidden"
				data-session-detail-fast-integration
			>
				{staleRevision ? (
					<output data-session-detail-integration-stale>
						Unexpected stale revision
					</output>
				) : null}
				<SessionDetailFastContent
					firstOverview={overview}
					initialSelectedTurnId={undefined}
					onStaleRevision={() => setStaleRevision(true)}
					responseScrollRef={responseScrollRef}
					userImageUrl={undefined}
					userMap={{ "integration-user": "Integration User" }}
				/>
			</div>
		</QueryClientProvider>
	);
}
