import { createContext, useContext } from "react";

export const ShellBottomNavigationPortalContext =
	createContext<HTMLElement | null>(null);

export function useShellBottomNavigationPortal() {
	return useContext(ShellBottomNavigationPortalContext);
}
