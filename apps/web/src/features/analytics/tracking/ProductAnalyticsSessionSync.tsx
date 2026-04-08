import { useEffect } from "react";
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

export function ProductAnalyticsSessionSync({
	session,
}: {
	session: AppSession | null | undefined;
}) {
	const userId = getSessionUserId(session);
	const email = getSessionUserEmail(session);
	const name = getSessionUserName(session);

	useEffect(() => {
		if (userId) {
			identifyProductAnalyticsUser(userId, {
				email,
				name,
			});
			return;
		}

		resetProductAnalytics();
	}, [email, name, userId]);

	return null;
}
