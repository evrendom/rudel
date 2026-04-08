import { useLocation } from "react-router-dom";
import {
	getCurrentShellRoute,
	type ShellRouteDefinition,
} from "@/features/shell/config/shell-routes";

export function useCurrentShellRoute(): ShellRouteDefinition {
	const location = useLocation();

	return getCurrentShellRoute(location.pathname);
}
