import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	type AppSession,
	getSessionUserEmail,
	getSessionUserId,
	getSessionUserName,
} from "@/features/auth/auth-route-utils";
import {
	identifyProductAnalyticsUser,
	resetProductAnalytics,
} from "@/lib/product-analytics";

function ProductAnalyticsSessionSyncMount({
	email,
	name,
	userId,
}: {
	email?: string;
	name?: string;
	userId: string | null;
}) {
	useMountEffect(() => {
		if (userId) {
			identifyProductAnalyticsUser(userId, {
				email,
				name,
			});
			return;
		}

		resetProductAnalytics();
	});

	return null;
}

export function ProductAnalyticsSessionSync({
	session,
}: {
	session: AppSession | null | undefined;
}) {
	const userId = getSessionUserId(session);
	const email = getSessionUserEmail(session);
	const name = getSessionUserName(session);

	return (
		<ProductAnalyticsSessionSyncMount
			key={userId ?? "anonymous"}
			email={email}
			name={name}
			userId={userId}
		/>
	);
}
