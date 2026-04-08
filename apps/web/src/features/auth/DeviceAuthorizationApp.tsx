import { useState } from "react";
import { AppLoadingScreen } from "@/app/bootstrap/AppLoadingScreen";
import { Button } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserId,
} from "@/features/auth/auth-route-utils";
import { GuestApp } from "@/features/auth/GuestApp";

export function DeviceAuthorizationApp({
	deviceUserCode,
	session,
}: {
	deviceUserCode: string;
	session: AppSession | null;
}) {
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "device_login",
	});
	const [deviceProcessing, setDeviceProcessing] = useState(false);
	const [deviceApproved, setDeviceApproved] = useState(false);
	const [deviceDenied, setDeviceDenied] = useState(false);
	const [deviceError, setDeviceError] = useState<string | null>(null);

	async function submitDeviceDecision(action: "approve" | "deny") {
		if (deviceProcessing) return;

		trackAuthenticationAction({
			actionName:
				action === "approve" ? "approve_device_login" : "deny_device_login",
			sourceComponent: "device_login",
			authMethod: "device_code",
			targetId: deviceUserCode,
			userId: getSessionUserId(session) ?? undefined,
		});

		setDeviceProcessing(true);
		setDeviceError(null);

		try {
			const response = await fetch(`/api/auth/device/${action}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userCode: deviceUserCode }),
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					error_description?: string;
					message?: string;
				} | null;

				throw new Error(
					body?.error_description ??
						body?.message ??
						`Failed to ${action} CLI device login`,
				);
			}

			if (action === "approve") {
				setDeviceApproved(true);
			} else {
				setDeviceDenied(true);
			}
		} catch (err) {
			setDeviceError(
				err instanceof Error ? err.message : "Failed to process device login",
			);
		} finally {
			setDeviceProcessing(false);
		}
	}

	if (!session) {
		return <GuestApp />;
	}

	if (deviceProcessing) {
		return <AppLoadingScreen message="Processing CLI login…" />;
	}

	if (deviceApproved) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-2">
				<p className="text-xl font-semibold">CLI login approved</p>
				<p className="text-muted-foreground">
					Return to your terminal to continue.
				</p>
			</div>
		);
	}

	if (deviceDenied) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-2">
				<p className="text-xl font-semibold">CLI login denied</p>
				<p className="text-muted-foreground">
					This authorization request was not approved.
				</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4">
			<p className="text-xl font-semibold">Authorize CLI login</p>
			<p className="text-muted-foreground">
				User code: <span className="font-mono">{deviceUserCode}</span>
			</p>
			{deviceError ? (
				<p className="text-destructive">{deviceError}</p>
			) : (
				<p className="text-muted-foreground">
					Approve this request only if it was initiated by you from the CLI.
				</p>
			)}
			<div className="flex gap-2">
				<Button onClick={() => submitDeviceDecision("approve")}>Approve</Button>
				<Button variant="outline" onClick={() => submitDeviceDecision("deny")}>
					Deny
				</Button>
			</div>
		</div>
	);
}
