import { useLocation } from "react-router-dom";
import { AppLoadingScreen } from "@/app/bootstrap/AppLoadingScreen";
import { ProductAnalyticsSessionSync } from "@/features/analytics/tracking/ProductAnalyticsSessionSync";
import { AuthenticatedApp } from "@/features/auth/AuthenticatedApp";
import {
	getDeviceUserCode,
	getValidRedirect,
	isResetPasswordPath,
} from "@/features/auth/auth-route-utils";
import { DeviceAuthorizationApp } from "@/features/auth/DeviceAuthorizationApp";
import { GuestApp } from "@/features/auth/GuestApp";
import { ResetPasswordApp } from "@/features/auth/ResetPasswordApp";
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

	if (deviceUserCode) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<DeviceAuthorizationApp
					key={deviceUserCode}
					deviceUserCode={deviceUserCode}
					session={session ?? null}
				/>
			</>
		);
	}

	if (session) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<AuthenticatedApp rootRedirectTarget={rootRedirectTarget} />
			</>
		);
	}

	if (isResetPasswordPath(location.pathname)) {
		return (
			<>
				<ProductAnalyticsSessionSync session={session} />
				<ResetPasswordApp />
			</>
		);
	}

	return (
		<>
			<ProductAnalyticsSessionSync session={session} />
			<GuestApp />
		</>
	);
}

export default App;
