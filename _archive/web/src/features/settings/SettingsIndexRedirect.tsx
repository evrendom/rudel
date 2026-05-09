import { Navigate, useSearchParams } from "react-router-dom";
import { getSettingsPathFromLegacyTab } from "@/features/settings/config/settings-routes";

export function SettingsIndexRedirect() {
	const [searchParams] = useSearchParams();
	const nextSearchParams = new URLSearchParams(searchParams);
	const nextPath = getSettingsPathFromLegacyTab(searchParams.get("tab"));

	nextSearchParams.delete("tab");

	const queryString = nextSearchParams.toString();

	return (
		<Navigate
			replace
			to={queryString ? `${nextPath}?${queryString}` : nextPath}
		/>
	);
}
