import { useLocation } from "react-router-dom";
import { AppLoadingScreen } from "@/app/bootstrap/AppLoadingScreen";
import { DeviceAuthorizationApp } from "@/features/auth/DeviceAuthorizationApp";
import { AuthenticatedApp } from "@/features/auth/AuthenticatedApp";
import { GuestApp } from "@/features/auth/GuestApp";
import {
	getDeviceUserCode,
	getValidRedirect,
} from "@/features/auth/auth-route-utils";
import { ProductAnalyticsSessionSync } from "@/features/analytics/tracking/ProductAnalyticsSessionSync";
import { authClient } from "./lib/auth-client";

function App() {
	const location = useLocation();
	const { data: session, isPending } = authClient.useSession();
	const deviceUserCode = getDeviceUserCode(location.search);
	const rootRedirectTarget = getValidRedirect(location.search);

	if (isPending) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<AppLoadingScreen />
			</>
		);
	}

	return (
		<>
			<ProductAnalyticsSessionSync session={session} />
			{deviceUserCode ? (
				<DeviceAuthorizationApp
					key={deviceUserCode}
					deviceUserCode={deviceUserCode}
					session={session ?? null}
				/>
			) : session ? (
				<AuthenticatedApp rootRedirectTarget={rootRedirectTarget} />
			) : (
				<GuestApp />
			)}
		</>
	);
}

export default App;
